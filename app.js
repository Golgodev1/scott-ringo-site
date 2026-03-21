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
let currentView = "work";

let audioContext = null;
let analyser = null;
let sourceNode = null;
let frequencyData = null;
let visualizerFrame = null;
let smoothedLevels = [];
let isVisualizerStopping = false;

/**
 * Safely fetch JSON and return null if missing.
 * @param {string} url
 * @returns {Promise<any|null>}
 */
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

/**
 * Format seconds as M:SS
 * @param {number} value
 * @returns {string}
 */
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
    ? `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="5" width="4" height="14"></rect>
        <rect x="13" y="5" width="4" height="14"></rect>
      </svg>
    `
    : `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="8,5 19,12 8,19"></polygon>
      </svg>
    `;
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
    if (!AudioContextClass) return;

    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

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
  if (!eqCanvas || !eqCtx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = eqCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (eqCanvas.width !== width || eqCanvas.height !== height) {
    eqCanvas.width = width;
    eqCanvas.height = height;
  }

  eqCtx.setTransform(1, 0, 0, 1, 0, 0);
}

function getVisualizerMetrics() {
  const w = eqCanvas.width;
  const h = eqCanvas.height;

  const cols = 120;
  const rows = 4;
  const gap = Math.max(1, Math.round(w * 0.0015));

  const totalGapWidth = gap * (cols - 1);
  const totalGapHeight = gap * (rows - 1);

  const cellW = Math.max(1, (w - totalGapWidth) / cols);
  const cellH = Math.max(1, (h - totalGapHeight) / rows);

  return { w, h, cols, rows, gap, cellW, cellH };
}

function drawGrid(activeRowCounts = null) {
  if (!eqCanvas || !eqCtx) return;

  sizeCanvas();

  const { w, h, cols, rows, gap, cellW, cellH } = getVisualizerMetrics();

  eqCtx.clearRect(0, 0, w, h);
  eqCtx.fillStyle = "#ffffff";
  eqCtx.fillRect(0, 0, w, h);

  for (let c = 0; c < cols; c++) {
    const x = c * (cellW + gap);
    const activeRows = activeRowCounts ? activeRowCounts[c] || 0 : 0;

    for (let r = 0; r < rows; r++) {
      const y = h - cellH - r * (cellH + gap);
      const isActive = r < activeRows;

      eqCtx.fillStyle = isActive ? "#000000" : "rgba(0, 0, 0, 0.10)";

      const drawX = Math.round(x);
      const drawY = Math.round(y);
      const drawW = Math.max(1, Math.ceil(cellW));
      const drawH = Math.max(1, Math.ceil(cellH));

      eqCtx.fillRect(drawX, drawY, drawW, drawH);
    }
  }

  eqCtx.fillStyle = "#ffffff";
  eqCtx.fillRect(Math.max(0, w - 1), 0, 1, h);
}

function drawIdleVisualizer() {
  drawGrid();
}

function drawVisualizer() {
  if (!eqCanvas || !eqCtx || !analyser || !frequencyData) return;

  sizeCanvas();

  const { cols, rows } = getVisualizerMetrics();
  const activeRowCounts = new Array(cols).fill(0);

  if (smoothedLevels.length !== cols) {
    smoothedLevels = new Array(cols).fill(0);
  }

  if (!isVisualizerStopping) {
    analyser.getByteFrequencyData(frequencyData);

    const bucketSize = Math.max(1, Math.floor(frequencyData.length / cols));

    for (let c = 0; c < cols; c++) {
      let sum = 0;
      const start = c * bucketSize;
      const end = Math.min(start + bucketSize, frequencyData.length);

      for (let i = start; i < end; i++) {
        sum += frequencyData[i];
      }

      const avg = end > start ? sum / (end - start) : 0;
      let normalized = avg / 255;

      if (avg < 8) {
        normalized = 0;
      }

      const riseSpeed = 0.6;
      const fallLerp = 0.08;

      if (normalized > smoothedLevels[c]) {
        smoothedLevels[c] += (normalized - smoothedLevels[c]) * riseSpeed;
      } else {
        smoothedLevels[c] += (normalized - smoothedLevels[c]) * fallLerp;
      }

      if (smoothedLevels[c] < 0.01) {
        smoothedLevels[c] = 0;
      }

      let activeRows = Math.round(smoothedLevels[c] * rows);
      activeRows = Math.max(0, Math.min(rows, activeRows));
      activeRowCounts[c] = activeRows;
    }
  } else {
    let stillActive = false;

    for (let c = 0; c < cols; c++) {
      smoothedLevels[c] *= 0.88;

      if (smoothedLevels[c] < 0.01) {
        smoothedLevels[c] = 0;
      } else {
        stillActive = true;
      }

      let activeRows = Math.round(smoothedLevels[c] * rows);
      activeRows = Math.max(0, Math.min(rows, activeRows));
      activeRowCounts[c] = activeRows;
    }

    if (!stillActive) {
      isVisualizerStopping = false;

      if (visualizerFrame) {
        window.cancelAnimationFrame(visualizerFrame);
        visualizerFrame = null;
      }

      drawIdleVisualizer();
      return;
    }
  }

  drawGrid(activeRowCounts);
  visualizerFrame = window.requestAnimationFrame(drawVisualizer);
}

function startVisualizer() {
  isVisualizerStopping = false;

  if (visualizerFrame) {
    window.cancelAnimationFrame(visualizerFrame);
    visualizerFrame = null;
  }

  drawVisualizer();
}

function stopVisualizer() {
  if (!eqCanvas || !eqCtx) return;

  isVisualizerStopping = true;

  if (!visualizerFrame) {
    drawVisualizer();
  }
}

function loadProjectTrack(project, autoPlay = false) {
  if (!project || !project.audio) return;

  setLoadedProject(project);
  pendingAudio = project.audio || "";
  smoothedLevels = [];
  isVisualizerStopping = false;

  audio.pause();
  audio.src = project.audio;
  audio.load();

  currentTimeEl.textContent = "0:00";
  durationEl.textContent = "0:00";
  progress.value = 0;
  setPlayIcon(false);
  drawIdleVisualizer();

  if (autoPlay) {
    audio.addEventListener(
      "canplay",
      async function handleAutoPlay() {
        audio.removeEventListener("canplay", handleAutoPlay);
        try {
          await ensureAudioContext();
          await audio.play();
          setPlayIcon(true);
        } catch (error) {
          console.error("Playback failed", error);
        }
      },
      { once: true }
    );
  }
}

const savedTheme = localStorage.getItem("scott-ringo-theme");
if (savedTheme) {
  setTheme(savedTheme);
}

themeToggle?.addEventListener("click", () => {
  setTheme(body.dataset.theme === "dark" ? "light" : "dark");
});

function setActiveNav(view) {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.view === view);
  });
  currentView = view;
}

function swapStage({ kicker, title, role = "", year = "", copy = "", showLoad = false }) {
  stage.classList.remove("is-visible");

  window.setTimeout(() => {
    stageKicker.textContent = kicker;
    stageTitle.textContent = title;
    stageRole.textContent = role;
    stageYear.textContent = year;
    stageCopy.textContent = copy;

    const hasMeta = Boolean(role || year);
    stageMeta.style.display = hasMeta ? "flex" : "none";
    stageMetaSep.style.display = role && year ? "inline" : "none";

    loadTrackBtn.style.display = showLoad ? "inline-block" : "none";
    stage.classList.add("is-visible");
  }, 180);
}

function renderProjects() {
  projectRowsContainer.innerHTML = "";

  projects.forEach((project, index) => {
    const button = document.createElement("button");
    button.className = "project-row";

    if (selectedProject && selectedProject.slug === project.slug) {
      button.classList.add("is-active");
    }

    button.dataset.slug = project.slug || "";
    button.dataset.title = project.title || "";
    button.dataset.year = project.year || "";
    button.dataset.role = project.role || "";
    button.dataset.description = project.description || "";
    button.dataset.audio = project.audio || "";

    button.innerHTML = `
      <span class="project-title">${project.title || "UNTITLED"}</span>
      <span class="project-year">${project.year || ""}</span>
    `;

    button.addEventListener("click", () => {
      updateProjectSelection(project);
    });

    projectRowsContainer.appendChild(button);

    if (index === projects.length - 1) {
      button.classList.add("last-row");
    }
  });
}

function updateProjectSelection(project) {
  selectedProject = project;
  pendingAudio = project.audio || "";
  currentView = "work";
  setActiveNav("");

  renderProjects();

  swapStage({
    kicker: "SELECTED WORK",
    title: project.title || "UNTITLED",
    role: project.role || "",
    year: project.year || "",
    copy: project.description || "",
    showLoad: Boolean(project.audio)
  });
}

function showAbout() {
  setActiveNav("about");

  swapStage({
    kicker: aboutContent?.kicker || "ABOUT",
    title: aboutContent?.title || "SCOTT RINGO",
    copy: aboutContent?.copy || "",
    showLoad: false
  });
}

function showContact() {
  setActiveNav("contact");

  swapStage({
    kicker: contactContent?.kicker || "CONTACT",
    title: contactContent?.title || "GET IN TOUCH",
    copy: contactContent?.copy || "",
    showLoad: false
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const view = link.dataset.view;
    if (view === "about") showAbout();
    if (view === "contact") showContact();
  });
});

infoBtn?.addEventListener("click", () => {
  if (loadedProject) {
    updateProjectSelection(loadedProject);
  } else if (selectedProject) {
    updateProjectSelection(selectedProject);
  }
});

loadTrackBtn?.addEventListener("click", () => {
  if (!selectedProject || !selectedProject.audio) return;
  loadProjectTrack(selectedProject, false);
});

playBtn?.addEventListener("click", async () => {
  if (!audio.src && selectedProject && selectedProject.audio) {
    loadProjectTrack(selectedProject, false);
  }

  if (!audio.src) return;

  if (audio.paused) {
    try {
      await ensureAudioContext();
      await audio.play();
      setPlayIcon(true);
    } catch (error) {
      console.error("Playback failed", error);
    }
  } else {
    audio.pause();
    setPlayIcon(false);
  }
});

if (nextBtn) {
  nextBtn.addEventListener("click", async () => {
    if (!projects.length) return;

    const currentIndex = loadedProject
      ? projects.findIndex((project) => project.slug === loadedProject.slug)
      : projects.findIndex((project) => selectedProject && project.slug === selectedProject.slug);

    const safeIndex = currentIndex >= 0 ? currentIndex : 0;

    let nextIndex = (safeIndex + 1) % projects.length;
    let attempts = 0;

    while (attempts < projects.length && !projects[nextIndex]?.audio) {
      nextIndex = (nextIndex + 1) % projects.length;
      attempts += 1;
    }

    const nextProject = projects[nextIndex];
    if (!nextProject || !nextProject.audio) return;

    updateProjectSelection(nextProject);
    loadProjectTrack(nextProject, true);
  });
}

audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(audio.currentTime);
  if (audio.duration) {
    progress.value = (audio.currentTime / audio.duration) * 100;
  }
});

audio.addEventListener("ended", () => {
  setPlayIcon(false);
  stopVisualizer();
});

audio.addEventListener("pause", () => {
  setPlayIcon(false);

  if (!audio.ended) {
    stopVisualizer();
  }
});

audio.addEventListener("play", () => {
  setPlayIcon(true);
  startVisualizer();
});

progress?.addEventListener("input", () => {
  if (audio.duration) {
    audio.currentTime = (Number(progress.value) / 100) * audio.duration;
  }
});

window.addEventListener("resize", () => {
  if (audio && !audio.paused) {
    startVisualizer();
  } else {
    drawIdleVisualizer();
  }
});

async function loadContent() {
  aboutContent = await fetchJson("/content/site/about.json");
  contactContent = await fetchJson("/content/site/contact.json");

  const projectsData = await fetchJson("/content/projects.json");

  projects = (projectsData?.projects || []).map((project, index) => ({
    ...project,
    slug: project.slug || `project-${index + 1}`
  }));

  if (projects.length === 0) {
    renderProjects();
    setLoadedProject(null);
    swapStage({
      kicker: "SELECTED WORK",
      title: "NO PROJECTS YET",
      copy: "Add a project in the CMS.",
      showLoad: false
    });
    setPlayIcon(false);
    drawIdleVisualizer();
    return;
  }

  selectedProject = projects[0];
  renderProjects();
  updateProjectSelection(selectedProject);
  setLoadedProject(null);
  setPlayIcon(false);
  drawIdleVisualizer();
}

loadContent();
