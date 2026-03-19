
const body = document.body;
const themeToggle = document.getElementById('themeToggle');
const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const progress = document.getElementById('progress');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const infoBtn = document.getElementById('infoBtn');

const navLinks = document.querySelectorAll('.nav-link');
const projectRows = document.querySelectorAll('.project-row');

const stage = document.getElementById('contentStage');
const stageKicker = document.getElementById('stageKicker');
const stageTitle = document.getElementById('stageTitle');
const stageMeta = document.getElementById('stageMeta');
const stageRole = document.getElementById('stageRole');
const stageYear = document.getElementById('stageYear');
const stageCopy = document.getElementById('stageCopy');
const loadTrackBtn = document.getElementById('loadTrackBtn');

let selectedProject = projectRows[0];
let pendingAudio = selectedProject.dataset.audio;
let currentView = 'work';

function formatTime(value) {
  if (!isFinite(value)) return '0:00';
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function setTheme(theme) {
  body.dataset.theme = theme;
  localStorage.setItem('scott-ringo-theme', theme);
}
const savedTheme = localStorage.getItem('scott-ringo-theme');
if (savedTheme) setTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  setTheme(body.dataset.theme === 'dark' ? 'light' : 'dark');
});

function setActiveNav(view) {
  navLinks.forEach(link => {
    link.classList.toggle('is-active', link.dataset.view === view);
  });
  currentView = view;
}

function swapStage({ kicker, title, role = '', year = '', copy = '', showLoad = false }) {
  stage.classList.remove('is-visible');

  setTimeout(() => {
    stageKicker.textContent = kicker;
    stageTitle.textContent = title;
    stageRole.textContent = role;
    stageYear.textContent = year;
    stageCopy.textContent = copy;

    if (role || year) {
      stageMeta.style.display = 'flex';
    } else {
      stageMeta.style.display = 'none';
    }

    loadTrackBtn.style.display = showLoad ? 'inline-block' : 'none';
    stage.classList.add('is-visible');
  }, 180);
}

function updateProjectSelection(row) {
  selectedProject = row;
  pendingAudio = row.dataset.audio;
  projectRows.forEach(item => item.classList.toggle('is-active', item === row));

  swapStage({
    kicker: 'SELECTED WORK',
    title: row.dataset.title,
    role: row.dataset.role,
    year: row.dataset.year,
    copy: row.dataset.description,
    showLoad: true
  });
}

projectRows.forEach(row => {
  row.addEventListener('click', () => {
    updateProjectSelection(row);
  });
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    const view = link.dataset.view;
    setActiveNav(view);

    if (view === 'about') {
      swapStage({
        kicker: 'ABOUT',
        title: 'SCOTT RINGO',
        copy: 'Scott Ringo creates sound design, composition, and audio post-production for film, television, brands, and experimental work. The focus is disciplined, high-end sonic design with clarity, texture, and strong visual sensitivity.',
        showLoad: false
      });
    } else if (view === 'contact') {
      swapStage({
        kicker: 'CONTACT',
        title: 'GET IN TOUCH',
        copy: 'For commissions, reel requests, and availability: hello@scottringo.com',
        showLoad: false
      });
    }
  });
});

infoBtn.addEventListener('click', () => {
  currentView = 'work';
  setActiveNav('');
  updateProjectSelection(selectedProject);
});

loadTrackBtn.addEventListener('click', () => {
  audio.pause();
  audio.src = pendingAudio;
  audio.load();
  playBtn.textContent = '▶';
  currentTimeEl.textContent = '0:00';
  progress.value = 0;
});

playBtn.addEventListener('click', async () => {
  if (!audio.src && pendingAudio) {
    audio.src = pendingAudio;
    audio.load();
  }

  if (!audio.src) return;

  if (audio.paused) {
    try {
      await audio.play();
      playBtn.textContent = '❚❚';
    } catch (err) {
      console.error(err);
    }
  } else {
    audio.pause();
    playBtn.textContent = '▶';
  }
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('timeupdate', () => {
  currentTimeEl.textContent = formatTime(audio.currentTime);
  if (audio.duration) {
    progress.value = (audio.currentTime / audio.duration) * 100;
  }
});

audio.addEventListener('ended', () => {
  playBtn.textContent = '▶';
});

progress.addEventListener('input', () => {
  if (audio.duration) {
    audio.currentTime = (progress.value / 100) * audio.duration;
  }
});

updateProjectSelection(selectedProject);
