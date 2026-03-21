const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const playIcon = document.getElementById("playIcon");
const nextBtn = document.getElementById("nextBtn");
const progress = document.getElementById("progress");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const nowPlaying = document.getElementById("nowPlaying");
const eqCanvas = document.getElementById("eqVisualizer");
const eqCtx = eqCanvas ? eqCanvas.getContext("2d") : null;

const navLinks = document.querySelectorAll(".nav-link");
const projectRowsContainer = document.getElementById("projectRows");

const stage = document.getElementById("contentStage");
const stageKicker = document.getElementById("stageKicker");
const stageTitle = document.getElementById("stageTitle");
const stageMeta = document.getElementById("stageMeta");
const stageMetaSep = document.getElementById("stageMetaSep");
const stageRole = document.getElementById("stageRole");
const stageYear = document.getElementById("stageYear");
const stageCopy = document.getElementById("stageCopy");
const loadTrackBtn = document.getElementById("loadTrackBtn");

let projects = [];
let aboutContent = null;
let contactContent = null;
let selectedProject = null;
let loadedProject = null;
let pendingAudio = "";
let currentView = "work";

let audioContext = null;
let analyser = null;
let sourceNode = null;
let frequencyData = null;
let visualizerFrame = null;

let smoothedLevels = [];

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Failed to load ${url}`, error);
    return null;
  }
}

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function setTheme(theme) {
  body.dataset.theme = theme;
  localStorage.setItem("scott-ringo-theme", theme);
}

function setPlayIcon(isPlaying) {
  if (!playIcon) return;

  playIcon.innerHTML = isPlaying
    ? `<svg viewBox="0 0 24 24"><rect x="7" y="5" width="4" height="14"></rect><rect x="13" y="5" width="4" height="14"></rect></svg>`
    : `<svg viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19"></polygon></svg>`;
}

function updateNowPlayingLabel() {
  if (!nowPlaying) return;
  nowPlaying.textContent = loadedProject?.title?.toUpperCase() || "NO TRACK LOADED";
}

function setLoadedProject(project) {
  loadedProject = project || null;
  updateNowPlayingLabel();
}

async function ensureAudioContext() {
  if (!eqCanvas || !eqCtx) return;

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    sourceNode = audioContext.createMediaElementSource(audio);
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);

    frequencyData = new Uint8Array(analyser.frequencyBinCount);
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = eqCanvas.getBoundingClientRect();
  eqCanvas.width = rect.width * dpr;
  eqCanvas.height = rect.height * dpr;
  eqCtx.setTransform(1, 0, 0, 1, 0, 0);
}

function getVisualizerGrid() {
  const w = eqCanvas.width;
  const h = eqCanvas.height;

  const cols = 120;
  const rows = 4;
  const gap = 2;

  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1)) / rows;

  return { w, h, cols, rows, gap, cellW, cellH };
}

function drawGrid(activeRowCounts = null) {
  sizeCanvas();

  const { w, h, cols, rows, gap, cellW, cellH } = getVisualizerGrid();

  eqCtx.clearRect(0, 0, w, h);
  eqCtx.fillStyle = "#ffffff";
  eqCtx.fillRect(0, 0, w, h);

  for (let c = 0; c < cols; c++) {
    const x = c * (cellW + gap);
    const activeRows = activeRowCounts ? activeRowCounts[c] || 0 : 0;

    for (let r = 0; r < rows; r++) {
      const y = h - cellH - r * (cellH + gap);
      const isActive = r < activeRows;

      eqCtx.fillStyle = isActive ? "#000" : "rgba(0,0,0,0.08)";
      eqCtx.fillRect(x, y, cellW, cellH);
    }
  }
}

function drawVisualizer() {
  const { cols, rows } = getVisualizerGrid();

  analyser.getByteFrequencyData(frequencyData);

  const bucketSize = Math.floor(frequencyData.length / cols);
  const activeRowCounts = new Array(cols).fill(0);

  if (smoothedLevels.length !== cols) {
    smoothedLevels = new Array(cols).fill(0);
  }

  for (let c = 0; c < cols; c++) {
    let sum = 0;
    for (let i = c * bucketSize; i < (c + 1) * bucketSize; i++) {
      sum += frequencyData[i] || 0;
    }

    const avg = sum / bucketSize;
    let normalized = avg / 255;

    if (avg < 8) normalized = 0;

    const rise = 0.6;
    const fall = 0.05;

    if (normalized > smoothedLevels[c]) {
      smoothedLevels[c] += (normalized - smoothedLevels[c]) * rise;
    } else {
      smoothedLevels[c] -= fall;
      if (normalized > smoothedLevels[c]) {
        smoothedLevels[c] = normalized;
      }
    }

    if (smoothedLevels[c] < 0.01) smoothedLevels[c] = 0;

    activeRowCounts[c] = Math.round(smoothedLevels[c] * rows);
  }

  drawGrid(activeRowCounts);
  visualizerFrame = requestAnimationFrame(drawVisualizer);
}

function startVisualizer() {
  cancelAnimationFrame(visualizerFrame);
  drawVisualizer();
}

function stopVisualizer() {
  cancelAnimationFrame(visualizerFrame);
  drawGrid();
}

function loadProjectTrack(project, autoPlay = false) {
  if (!project?.audio) return;

  smoothedLevels = [];

  setLoadedProject(project);

  audio.src = project.audio;
  audio.load();

  if (autoPlay) {
    audio.addEventListener("canplay", async function once() {
      audio.removeEventListener("canplay", once);
      await ensureAudioContext();
      await audio.play();
    });
  }
}

playBtn.addEventListener("click", async () => {
  if (!audio.src && selectedProject?.audio) {
    loadProjectTrack(selectedProject);
  }

  if (audio.paused) {
    await ensureAudioContext();
    audio.play();
  } else {
    audio.pause();
  }
});

audio.addEventListener("play", startVisualizer);
audio.addEventListener("pause", stopVisualizer);
audio.addEventListener("ended", stopVisualizer);

audio.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(audio.currentTime);
  if (audio.duration) {
    progress.value = (audio.currentTime / audio.duration) * 100;
  }
});

audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

progress.addEventListener("input", () => {
  if (audio.duration) {
    audio.currentTime = (progress.value / 100) * audio.duration;
  }
});

async function loadContent() {
  const data = await fetchJson("/content/projects.json");
  projects = data?.projects || [];

  selectedProject = projects[0];
}

loadContent();
