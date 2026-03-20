const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const progress = document.getElementById("progress");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const infoBtn = document.getElementById("infoBtn");

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
let pendingAudio = "";
let currentView = "work";

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

const savedTheme = localStorage.getItem("scott-ringo-theme");
if (savedTheme) setTheme(savedTheme);

themeToggle.addEventListener("click", () => {
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

infoBtn.addEventListener("click", () => {
  if (selectedProject) {
    updateProjectSelection(selectedProject);
  }
});

loadTrackBtn.addEventListener("click", () => {
  if (!pendingAudio) return;

  audio.pause();
  audio.src = pendingAudio;
  audio.load();
  playBtn.textContent = "▶";
  currentTimeEl.textContent = "0:00";
  durationEl.textContent = "0:00";
  progress.value = 0;
});

playBtn.addEventListener("click", async () => {
  if (!audio.src && pendingAudio) {
    audio.src = pendingAudio;
    audio.load();
  }

  if (!audio.src) return;

  if (audio.paused) {
    try {
      await audio.play();
      playBtn.textContent = "❚❚";
    } catch (error) {
      console.error("Playback failed", error);
    }
  } else {
    audio.pause();
    playBtn.textContent = "▶";
  }
});

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
  playBtn.textContent = "▶";
});

progress.addEventListener("input", () => {
  if (audio.duration) {
    audio.currentTime = (Number(progress.value) / 100) * audio.duration;
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
    swapStage({
      kicker: "SELECTED WORK",
      title: "NO PROJECTS YET",
      copy: "Add a project in the CMS.",
      showLoad: false
    });
    return;
  }

  selectedProject = projects[0];
  renderProjects();
  updateProjectSelection(selectedProject);
}

loadContent();
