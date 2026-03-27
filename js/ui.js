// UI rendering and event handling
import { schoolData, studyData, subjectFull, iconMap, days } from './data.js';

let currentView = 'school';
let activeDayIndex = 0;
const STORAGE_KEYS = {
  view: 'iza-time-current-view',
  day: 'iza-time-active-day',
  complete: 'iza-time-completed',
};

// DOM references
let btnSchool, btnStudy, btnToday, btnReset, dayScheduleDiv, dayChips, activeViewSpan, currentDTSpan;

let completedSubjects = {}; // { school: { MON: [0,2], ... }, study: {...} }

// Initialize DOM references
export function initDOM() {
  try {
    btnSchool = document.getElementById('btnSchool');
    btnStudy = document.getElementById('btnStudy');
  btnToday = document.getElementById('btnToday');
  btnReset = document.getElementById('btnReset');
    activeViewSpan = document.getElementById('activeViewLabel');
    currentDTSpan = document.getElementById('currentDateTime');

    // Validate critical elements exist
    if (!dayScheduleDiv || !dayChips || !activeViewSpan || !currentDTSpan) {
      throw new Error('Critical DOM elements not found');
    }

    console.log('DOM initialized successfully');
  } catch (error) {
    console.error('DOM initialization failed:', error);
    // Fallback: show error message
    showError('Failed to initialize app. Please refresh the page.');
  }
}

// Show error message to user
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ff6b6b;
    color: white;
    padding: 20px;
    border-radius: 12px;
    text-align: center;
    z-index: 10000;
    font-family: 'Sora', sans-serif;
  `;
  errorDiv.innerHTML = `<h3>⚠️ Error</h3><p>${message}</p>`;
  document.body.appendChild(errorDiv);
}

// Clock functionality
export function initClock() {
  if (!currentDTSpan) {
    console.warn('Clock element not found');
    return;
  }

  function updateClock() {
    try {
      const now = new Date();
      const opts = { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
      currentDTSpan.textContent = now.toLocaleString('en-GB', opts).replace(',', ' ·');
    } catch (error) {
      console.error('Clock update failed:', error);
      currentDTSpan.textContent = 'Time error';
    }
  }

  updateClock(); // Initial call
  setInterval(updateClock, 1000);
}

// Today detection
function getTodayKey() {
  const map = ['SUN','MON','TUE','WED','THUR','FRI','SAT'];
  return map[new Date().getDay()];
}

function loadPersistedState() {
  try {
    const persistedView = localStorage.getItem(STORAGE_KEYS.view);
    const persistedDay = Number(localStorage.getItem(STORAGE_KEYS.day));
    if (persistedView === 'school' || persistedView === 'study') {
      currentView = persistedView;
    }
    if (!Number.isNaN(persistedDay) && persistedDay >= 0 && persistedDay < days.length) {
      activeDayIndex = persistedDay;
    }
  } catch (error) {
    console.warn('Could not load persisted state:', error);
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEYS.view, currentView);
    localStorage.setItem(STORAGE_KEYS.day, String(activeDayIndex));
    localStorage.setItem(STORAGE_KEYS.complete, JSON.stringify(completedSubjects));
  } catch (error) {
    console.warn('Could not persist state:', error);
  }
}

function loadCompletedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.complete);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        completedSubjects = parsed;
      }
    }
  } catch (error) {
    console.warn('Could not load completed state:', error);
    completedSubjects = {};
  }
}

export function initDayChips() {
  loadPersistedState();
  loadCompletedState();
  const todayKey = getTodayKey();
  const todayIdx = days.indexOf(todayKey);

  if (activeDayIndex < 0 || activeDayIndex >= days.length) {
    activeDayIndex = todayIdx >= 0 ? todayIdx : 0;
  }

  dayChips.forEach((chip, i) => {
    chip.classList.remove('active-day', 'today-chip');
    if (i === activeDayIndex) chip.classList.add('active-day');
    if (days[i] === todayKey) chip.classList.add('today-chip');
  });

  persistState();
}

// Timetable rendering
export function renderTimetable() {
  if (!dayScheduleDiv) {
    console.error('Cannot render timetable: dayScheduleDiv not found');
    return;
  }

  try {
    const src = currentView === 'school' ? schoolData : studyData;
    const subjects = src[days[activeDayIndex]] || [];

    if (!subjects.length) {
      dayScheduleDiv.innerHTML =
        '<div class="empty-subject">⏳ Nothing scheduled — enjoy the break!</div>';
    } else {
      const completedForDay = (completedSubjects[currentView] && completedSubjects[currentView][days[activeDayIndex]]) || [];

    const html = subjects.map((code, index) => {
      const c = code.trim();
      const subjectName = subjectFull[c] || c;
      const icon = iconMap[c] || iconMap.default;
      const isComplete = completedForDay.includes(index);

      return `<div class="subject-row${isComplete ? ' completed' : ''}" data-subject-index="${index}">
        <span class="subject-code">${c}</span>
        <span class="subject-name">${subjectName}</span>
        <div class="row-icon">${icon}</div>
      </div>`;
    }).join('');

    dayScheduleDiv.innerHTML = html;

    // Set up click-to-toggle complete after render
    dayScheduleDiv.querySelectorAll('.subject-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = Number(row.getAttribute('data-subject-index'));
        if (!Number.isFinite(idx)) return;

        const day = days[activeDayIndex];
        completedSubjects[currentView] = completedSubjects[currentView] || {};
        completedSubjects[currentView][day] = completedSubjects[currentView][day] || [];

        const currentList = completedSubjects[currentView][day];
        const pos = currentList.indexOf(idx);
        if (pos >= 0) {
          currentList.splice(pos, 1);
          row.classList.remove('completed');
        } else {
          currentList.push(idx);
          row.classList.add('completed');
        }

        persistState();
      });
    });
  }

    // Update view badge
    if (activeViewSpan) {
      activeViewSpan.textContent = currentView === 'school' ? '🏫 school' : '✏️ study';
    }

  } catch (error) {
    console.error('Timetable rendering failed:', error);
    dayScheduleDiv.innerHTML = '<div class="empty-subject">❌ Error loading timetable</div>';
  }
}

// Event handlers
export function initEventHandlers() {
  if (!btnSchool || !btnStudy || !dayChips) {
    console.error('Cannot initialize event handlers: DOM elements not found');
    return;
  }

  function setView(v) {
    if (v !== 'school' && v !== 'study') {
      console.error('Invalid view:', v);
      return;
    }

    currentView = v;
    btnSchool.classList.toggle('active', v === 'school');
    btnStudy.classList.toggle('active', v === 'study');
    persistState();
    renderTimetable();
  }

  // Day chip clicks
  dayChips.forEach((chip, i) => {
    chip.addEventListener('click', () => {
      if (i < 0 || i >= days.length) {
        console.error('Invalid day index:', i);
        return;
      }

      activeDayIndex = i;
      persistState();
      dayChips.forEach((c, j) => c.classList.toggle('active-day', j === i));
      renderTimetable();
    });
  });

  // View toggle buttons
  btnSchool.addEventListener('click', () => setView('school'));
  btnStudy.addEventListener('click', () => setView('study'));

  // Today / Reset actions
  btnToday.addEventListener('click', () => {
    const todayKey = getTodayKey();
    const todayIdx = days.indexOf(todayKey);
    if (todayIdx >= 0) {
      activeDayIndex = todayIdx;
      dayChips.forEach((c, j) => c.classList.toggle('active-day', j === todayIdx));
      persistState();
      renderTimetable();
    }
  });

  btnReset.addEventListener('click', () => {
    currentView = 'school';
    btnSchool.classList.add('active');
    btnStudy.classList.remove('active');
    activeDayIndex = days.indexOf(getTodayKey());
    if (activeDayIndex < 0) activeDayIndex = 0;
    dayChips.forEach((c, j) => c.classList.toggle('active-day', j === activeDayIndex));
    persistState();
    renderTimetable();
  });

  // Ensure view buttons reflect restored state
  if (currentView === 'study') {
    btnSchool.classList.remove('active');
    btnStudy.classList.add('active');
  } else {
    btnSchool.classList.add('active');
    btnStudy.classList.remove('active');
  }

  console.log('Event handlers initialized');
}

// Splash screen
export function initSplash() {
  const splash = document.getElementById('splash');
  setTimeout(() => splash.classList.add('hidden'), 1200);
}