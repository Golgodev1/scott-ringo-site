const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const playIcon = document.getElementById("playIcon");
const nextBtn = document.getElementById("nextBtn");
const progress = document.getElementById("progress");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const infoBtn = document.getElementById("infoBtn");
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

let audioContext = null;
let analyser = null;
let sourceNode = null;
let frequencyData = null;
let visualizerFrame = null;

function fetchJson(url) {
  return fetch(url, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
}

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function setPlayIcon(isPlaying) {
  if (!playIcon) return;
  playIcon.innerHTML = isPlaying
    ? `<svg viewBox="0 0 24 24"><rect x="7" y="5" width="4" height="14"></rect><rect x="13" y="5" width="4" height="14"></rect></svg>`
    : `<svg viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19"></polygon></svg>`;
}

function updateNowPlayingLabel() {
  nowPlaying.textContent =
    loadedProject?.title?.toUpperCase() || "NO TRACK LOADED";
}

function setLoadedProject(project) {
  loadedProject = project || null;
  updateNowPlayingLabel();
}

async function ensureAudioContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioContext = new Ctx();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    sourceNode = audioContext.createMediaElementSource(audio);
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

/* =========================
   GRID VISUALIZER
========================= */

function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = eqCanvas.getBoundingClientRect();
  eqCanvas.width = rect.width * dpr;
  eqCanvas.height = rect.height * dpr;
}

function drawIdleVisualizer() {
  if (!eqCanvas) return;
  sizeCanvas();

  const w = eqCanvas.width;
  const h = eqCanvas.height;

  const cols = 12;
  const rows = 4;
  const gap = 3;
  const size = Math.min(
    (w - gap * (cols - 1)) / cols,
    (h - gap * (rows - 1)) / rows
  );

  const startX = (w - (cols * size + gap * (cols - 1))) / 2;
  const startY = (h - (rows * size + gap * (rows - 1))) / 2;

  eqCtx.fillStyle = "#fff";
  eqCtx.fillRect(0, 0, w, h);

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      eqCtx.fillStyle = "rgba(0,0,0,0.1)";
      eqCtx.fillRect(
        startX + c * (size + gap),
        startY + r * (size + gap),
        size,
        size
      );
    }
  }
}

function drawVisualizer() {
  if (!analyser) return;

  sizeCanvas();

  const w = eqCanvas.width;
  const h = eqCanvas.height;

  const cols = 12;
  const rows = 4;
  const gap = 3;
  const size = Math.min(
    (w - gap * (cols - 1)) / cols,
    (h - gap * (rows - 1)) / rows
  );

  const startX = (w - (cols * size + gap * (cols - 1))) / 2;
  const startY = (h - (rows * size + gap * (rows - 1))) / 2;

  analyser.getByteFrequencyData(frequencyData);

  eqCtx.fillStyle = "#fff";
  eqCtx.fillRect(0, 0, w, h);

  const bucket = Math.floor(frequencyData.length / cols);

  for (let c = 0; c < cols; c++) {
    let sum = 0;
    for (let i = 0; i < bucket; i++) {
      sum += frequencyData[c * bucket + i];
    }

    const level = Math.round((sum / bucket / 255) * rows);

    for (let r = 0; r < rows; r++) {
      const active = r < level;

      eqCtx.fillStyle = active ? "#000" : "rgba(0,0,0,0.1)";
      eqCtx.fillRect(
        startX + c * (size + gap),
        startY + (rows - r - 1) * (size + gap),
        size,
        size
      );
    }
  }

  visualizerFrame = requestAnimationFrame(drawVisualizer);
}

function startVisualizer() {
  cancelAnimationFrame(visualizerFrame);
  drawVisualizer();
}

function stopVisualizer() {
  cancelAnimationFrame(visualizerFrame);
  drawIdleVisualizer();
}

/* ========================= */

function loadProjectTrack(project) {
  if (!project?.audio) return;

  setLoadedProject(project);

  audio.pause();
  audio.src = project.audio;
  audio.load();

  progress.value = 0;
  currentTimeEl.textContent = "0:00";
  durationEl.textContent = "0:00";

  setPlayIcon(false);
  stopVisualizer();
}

/* ========================= */

playBtn.addEventListener("click", async () => {
  if (!audio.src && selectedProject) {
    loadProjectTrack(selectedProject);
  }

  if (audio.paused) {
    await ensureAudioContext();
    await audio.play();
    setPlayIcon(true);
  } else {
    audio.pause();
    setPlayIcon(false);
  }
});

audio.addEventListener("play", () => startVisualizer());
audio.addEventListener("pause", () => stopVisualizer());
audio.addEventListener("ended", () => stopVisualizer());

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

/* ========================= */

async function loadContent() {
  aboutContent = await fetchJson("/content/site/about.json");
  contactContent = await fetchJson("/content/site/contact.json");

  const data = await fetchJson("/content/projects.json");

  projects = (data?.projects || []).map((p, i) => ({
    ...p,
    slug: p.slug || `project-${i}`
  }));

  if (!projects.length) {
    drawIdleVisualizer();
    return;
  }

  selectedProject = projects[0];
  drawIdleVisualizer();
}

loadContent();
