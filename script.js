const daySelect = document.getElementById('daySelect');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');
const exploreBtn = document.getElementById('exploreBtn');
const randomBtn = document.getElementById('randomBtn');
const nextVideoBtn = document.getElementById('nextVideoBtn');
const ambientToggleBtn = document.getElementById('ambientToggleBtn');
const resultContainer = document.getElementById('resultContainer');
const loader = document.getElementById('loader');
const playerStatus = document.getElementById('playerStatus');

let autoAdvanceTimer = null;
let currentYear = 2026;
let currentVideoElement = null;
let isAmbientMuted = false;

// Performance Caches for fast repeat searches
const metadataCache = new Map();
const searchCache = new Map();

// Global Canvas (Background Stars)
const canvas = document.getElementById('starsCanvas');
const ctx = canvas.getContext('2d');

// --- Web Audio Engine ---
let audioCtx = null;
let delayNode, feedbackGain, reverbNode, reverbGain, chorusNode, chorusLFO, droneOsc, droneGain;
let masterGain;

function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return;
    }
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.8;
        masterGain.connect(audioCtx.destination);

        // Chorus
        chorusNode = audioCtx.createDelay();
        chorusNode.delayTime.value = 0.02;
        chorusLFO = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        chorusLFO.frequency.value = 0.5;
        lfoGain.gain.value = 0.003;
        chorusLFO.connect(lfoGain);
        lfoGain.connect(chorusNode.delayTime);
        chorusLFO.start();

        // Delay with Feedback
        delayNode = audioCtx.createDelay(2.0);
        delayNode.delayTime.value = 0.4;
        feedbackGain = audioCtx.createGain();
        feedbackGain.gain.value = 0.3;

        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);

        // Reverb
        reverbNode = audioCtx.createConvolver();
        reverbGain = audioCtx.createGain();
        reverbGain.gain.value = 0.5;
        createReverbPulse();

        // FX Chain
        chorusNode.connect(delayNode);
        delayNode.connect(reverbGain);
        reverbGain.connect(masterGain);

        // Ambient Space Drone
        droneOsc = audioCtx.createOscillator();
        droneOsc.type = 'sawtooth';
        droneOsc.frequency.value = 55;
        droneGain = audioCtx.createGain();
        droneGain.gain.value = isAmbientMuted ? 0 : 0.05;

        const droneLowpass = audioCtx.createBiquadFilter();
        droneLowpass.type = 'lowpass';
        droneLowpass.frequency.value = 150;

        droneOsc.connect(droneLowpass);
        droneLowpass.connect(droneGain);
        droneGain.connect(masterGain);
        droneOsc.start();
    } catch (e) {
        console.warn("Web Audio Initialization failed:", e);
    }
}

async function createReverbPulse() {
    if (!audioCtx) return;
    const len = audioCtx.sampleRate * 2.5;
    const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
        const data = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
        }
    }
    reverbNode.buffer = buf;
}

// Global user interaction listener to unlock AudioContext & Video Sound
function unlockAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (currentVideoElement) {
        currentVideoElement.muted = false;
        currentVideoElement.play().catch(() => {});
    }
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

// --- Global Stars ---
let stars = [];
function initStars() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = [];
    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.5,
            speed: Math.random() * 0.05 + 0.02,
            hue: Math.random() * 360
        });
    }
}

function animateStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
        s.y += s.speed;
        s.hue += 0.1;
        if (s.y > canvas.height) s.y = 0;
        ctx.fillStyle = `hsl(${s.hue}, 70%, 70%)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    });
    requestAnimationFrame(animateStars);
}

// --- Data Selectors ---
function initSelectors() {
    daySelect.innerHTML = ''; monthSelect.innerHTML = ''; yearSelect.innerHTML = '';
    for (let i = 1; i <= 31; i++) {
        const val = i.toString().padStart(2, '0');
        daySelect.add(new Option(val, val));
    }
    for (let i = 1; i <= 12; i++) {
        const val = i.toString().padStart(2, '0');
        monthSelect.add(new Option(val, val));
    }
    for (let i = 2026; i >= 1900; i--) {
        yearSelect.add(new Option(i, i.toString()));
    }
    yearSelect.value = "1995";
}

function setRandomDate() {
    const minYear = 1950;
    const maxYear = 2025;

    const startTs = new Date(minYear, 0, 1).getTime();
    const endTs = new Date(maxYear, 11, 31).getTime();
    const randomTs = startTs + Math.random() * (endTs - startTs);
    const date = new Date(randomTs);

    const y = date.getFullYear().toString();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');

    if (yearSelect.querySelector(`option[value="${y}"]`)) yearSelect.value = y;
    monthSelect.value = m;
    daySelect.value = d;
}

function clearAllTimers() {
    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
    }
    if (currentVideoElement) {
        currentVideoElement.onended = null;
        currentVideoElement.onerror = null;
        currentVideoElement.onplaying = null;
        currentVideoElement = null;
    }
}

function loadNextVideo() {
    clearAllTimers();
    setRandomDate();
    exploreBtn.click();
}

// Initialization flow
initStars();
animateStars();
initSelectors();

window.addEventListener('load', () => {
    setRandomDate();
    exploreBtn.click();
});

randomBtn.onclick = () => {
    initAudio();
    unlockAudio();
    loadNextVideo();
};

if (nextVideoBtn) {
    nextVideoBtn.onclick = () => {
        initAudio();
        unlockAudio();
        loadNextVideo();
    };
}

if (ambientToggleBtn) {
    ambientToggleBtn.onclick = () => {
        initAudio();
        isAmbientMuted = !isAmbientMuted;
        if (droneGain) {
            droneGain.gain.value = isAmbientMuted ? 0 : 0.05;
        }
        if (isAmbientMuted) {
            ambientToggleBtn.textContent = '🔇 ЕМБІЄНТ: ВИМК';
            ambientToggleBtn.classList.add('muted');
        } else {
            ambientToggleBtn.textContent = '🔊 ЕМБІЄНТ: УВІМК';
            ambientToggleBtn.classList.remove('muted');
        }
    };
}

window.onresize = () => {
    initStars();
};

exploreBtn.onclick = async () => {
    initAudio();
    unlockAudio();
    clearAllTimers();
    const d = daySelect.value;
    const m = monthSelect.value;
    const y = yearSelect.value;
    currentYear = parseInt(y);
    const selectedDate = `${y}-${m}-${d}`;

    resultContainer.classList.add('hidden');
    loader.classList.remove('hidden');
    if (playerStatus) playerStatus.textContent = "ШВИДКИЙ ПОШУК...";

    try {
        const [archiveVideo, atmosphere] = await Promise.all([
            fetchArchiveVideo(selectedDate),
            generateAtmosphereSummary(selectedDate)
        ]);
        renderResults(selectedDate, archiveVideo, atmosphere);
    } catch (error) {
        console.error("Explore error:", error);
        handleVideoFailure("ПОМИЛКА ПОШУКУ. СПРОБУЙТЕ ЩЕ РАЗ");
    } finally {
        loader.classList.add('hidden');
        resultContainer.classList.remove('hidden');
    }
};

// --- OPTIMIZED PARALLEL ARCHIVE SEARCH & METADATA RESOLUTION ---
async function fetchArchiveVideo(date) {
    const [year, month] = date.split('-');

    const searchUrl = (query, limit = 15) => 
        `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title,downloads&sort[]=downloads+desc&rows=${limit}&output=json`;

    const fetchJson = async (url) => {
        if (searchCache.has(url)) return searchCache.get(url);
        try {
            const res = await fetch(url);
            const data = await res.json();
            searchCache.set(url, data);
            return data;
        } catch (e) {
            return { response: { docs: [] } };
        }
    };

    try {
        const qExact = `date:${date} AND mediatype:movies`;
        const qMonth = `year:${year} AND date:${year}-${month}* AND mediatype:movies`;
        const qYear = `year:${year} AND mediatype:movies`;

        // Run exact date & month search in parallel for fast resolution
        let [dataExact, dataMonth] = await Promise.all([
            fetchJson(searchUrl(qExact, 10)),
            fetchJson(searchUrl(qMonth, 10))
        ]);

        let items = dataExact?.response?.docs || [];
        if (!items.length) items = dataMonth?.response?.docs || [];

        // Fallback to year search if exact & month had no records
        if (!items.length) {
            const dataYear = await fetchJson(searchUrl(qYear, 25));
            items = dataYear?.response?.docs || [];
        }

        if (!items.length) {
            return { title: "Відео-хроніка відсутня", id: null, duration: 0, url: null };
        }

        // Shuffle top candidates to vary video selection
        const candidateItems = [...items].sort(() => Math.random() - 0.5).slice(0, 4);

        // Parallel metadata fetch for all candidates
        const metadataResults = await Promise.all(
            candidateItems.map(item => {
                if (metadataCache.has(item.identifier)) {
                    return Promise.resolve({ item, metaData: metadataCache.get(item.identifier) });
                }
                return fetch(`https://archive.org/metadata/${item.identifier}`)
                    .then(res => res.json())
                    .then(metaData => {
                        metadataCache.set(item.identifier, metaData);
                        return { item, metaData };
                    })
                    .catch(() => null);
            })
        );

        for (const res of metadataResults) {
            if (!res || !res.metaData) continue;
            const { item, metaData } = res;

            if (metaData.files && metaData.files.length) {
                const videoFiles = metaData.files.filter(f => {
                    const name = (f.name || '').toLowerCase();
                    const format = (f.format || '').toLowerCase();
                    return format.includes('h.264') || format.includes('mpeg4') || format.includes('mp4') || format.includes('webm') || name.endsWith('.mp4') || name.endsWith('.webm');
                });

                videoFiles.sort((a, b) => {
                    const aSample = (a.name || '').toLowerCase().includes('sample') || (a.name || '').toLowerCase().includes('thumb');
                    const bSample = (b.name || '').toLowerCase().includes('sample') || (b.name || '').toLowerCase().includes('thumb');
                    if (aSample && !bSample) return 1;
                    if (!aSample && bSample) return -1;
                    return (parseFloat(b.duration) || 0) - (parseFloat(a.duration) || 0);
                });

                const chosenFile = videoFiles[0];
                if (chosenFile) {
                    const duration = parseFloat(chosenFile.duration) || 0;
                    const safePath = chosenFile.name.split('/').map(encodeURIComponent).join('/');
                    const videoUrl = `https://archive.org/download/${item.identifier}/${safePath}`;
                    return { title: item.title, id: item.identifier, duration: duration || 45, url: videoUrl };
                }
            }

            if (item.identifier) {
                return { title: item.title, id: item.identifier, duration: 45, url: null };
            }
        }

        return { title: "Відео-хроніка відсутня", id: null, duration: 0, url: null };

    } catch (e) {
        console.error("Archive Search Error:", e);
        return { title: "Відео-хроніка відсутня", id: null, duration: 0, url: null };
    }
}

async function generateAtmosphereSummary(date) {
    const dStr = date.split('-').reverse().join('.');
    return `Аналітичний звіт ${dStr}. Спектральний аналіз завершено. Рівень фонової активності стабільний.`;
}

function handleVideoFailure(reason = "ПОМИЛКА ВІДЕО") {
    console.warn("Video playback failure:", reason);
    if (playerStatus) playerStatus.textContent = reason;
    clearAllTimers();
}

function renderResults(date, video, atmosphere) {
    document.getElementById('displayDate').textContent = date.split('-').reverse().join('.');
    document.getElementById('aiAtmosphere').textContent = atmosphere;
    document.getElementById('videoDesc').textContent = video.title || "Хроніка часу";

    const videoMedia = document.getElementById('videoMedia');
    videoMedia.innerHTML = '';
    clearAllTimers();

    if (playerStatus) playerStatus.textContent = "ПОТІК ГОТОВИЙ";

    if (!video.url && !video.id) {
        if (playerStatus) playerStatus.textContent = "ВІДЕО НЕ ЗНАЙДЕНО";
        videoMedia.innerHTML = `<div class="no-video-placeholder"><p>ВІДЕО-ХРОНІКА ВІДСУТНЯ ДЛЯ ЦІЄЇ ДАТИ</p></div>`;
        return;
    }

    if (video.url) {
        const v = document.createElement('video');
        v.src = video.url;
        v.autoplay = true;
        v.muted = false; // Start with sound enabled
        v.controls = true;
        v.playsInline = true;
        v.preload = "auto";
        v.style.width = "100%";
        v.style.height = "100%";
        v.style.objectFit = "contain";
        v.style.backgroundColor = "#000";

        currentVideoElement = v;

        v.onplaying = () => {
            if (playerStatus) playerStatus.textContent = "ПОТІК АКТИВНИЙ ● LIVE";
        };

        v.onplay = () => {
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        };

        // CRITICAL PRINCIPLE: Video MUST ONLY switch AFTER video finishes playing (ended event)
        v.onended = () => {
            console.log("Video playback completed naturally. Loading next video...");
            if (playerStatus) playerStatus.textContent = "ВІДЕО ЗАВЕРШЕНО. НАСТУПНЕ...";
            loadNextVideo();
        };

        v.onerror = (e) => {
            console.warn("Direct video element error, trying iframe fallback...", e);
            if (video.id) {
                loadIframeFallback(videoMedia, video);
            } else {
                handleVideoFailure("ПОМИЛКА ВІДТВОРЕННЯ ВІДЕО");
            }
        };

        // Handle autoplay policy with audio fallback cleanly
        const playPromise = v.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.log("Autoplay with audio blocked by browser, playing muted until user click...", err);
                v.muted = true;
                v.play().catch(e => console.warn("Muted play failed:", e));
            });
        }

        videoMedia.appendChild(v);
        addFullscreenButton(videoMedia);

    } else if (video.id) {
        loadIframeFallback(videoMedia, video);
    }
}

function loadIframeFallback(container, video) {
    if (playerStatus) playerStatus.textContent = "ПОТІК EMBED ● LIVE";
    container.innerHTML = `<iframe id="activeIframe" src="https://archive.org/embed/${video.id}?autoplay=1" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    addFullscreenButton(container);

    const messageHandler = (event) => {
        if (event.data) {
            const dataStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
            if (dataStr.includes('ended') || dataStr.includes('finish')) {
                console.log("Iframe postMessage received video ended. Loading next...");
                window.removeEventListener('message', messageHandler);
                loadNextVideo();
            }
        }
    };
    window.addEventListener('message', messageHandler);

    const dur = (video.duration && video.duration > 10) ? video.duration + 5 : 60;
    clearAllTimers();
    autoAdvanceTimer = setTimeout(() => {
        console.log("Iframe duration timer completed. Loading next video...");
        window.removeEventListener('message', messageHandler);
        loadNextVideo();
    }, dur * 1000);
}

function addFullscreenButton(container) {
    const btn = document.createElement('button');
    btn.innerHTML = '⛶';
    btn.title = "Повний екран";
    btn.style.position = 'absolute';
    btn.style.top = '10px';
    btn.style.right = '10px';
    btn.style.background = 'rgba(0, 0, 0, 0.7)';
    btn.style.color = '#00f3ff';
    btn.style.border = '1px solid #00f3ff';
    btn.style.padding = '6px 10px';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = '100';
    btn.style.fontSize = '14px';
    btn.style.borderRadius = '3px';

    btn.onclick = () => {
        const elem = container.querySelector('video') || container.querySelector('iframe') || container;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        } else if (container.requestFullscreen) {
            container.requestFullscreen();
        }
    };
    container.appendChild(btn);
}
