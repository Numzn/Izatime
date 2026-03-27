// UI rendering and event handling
import { schoolData, studyData, subjectFull, iconMap, days } from './data.js';

let currentView = 'school';
let activeDayIndex = 0;

// DOM references
let btnSchool, btnStudy, dayScheduleDiv, dayChips, activeViewSpan, currentDTSpan;

// Initialize DOM references
export function initDOM() {
  try {
    btnSchool = document.getElementById('btnSchool');
    btnStudy = document.getElementById('btnStudy');
    dayScheduleDiv = document.getElementById('daySchedule');
    dayChips = document.querySelectorAll('.day-chip');
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

export function initDayChips() {
  const todayKey = getTodayKey();
  const todayIdx = days.indexOf(todayKey);
  activeDayIndex = todayIdx >= 0 ? todayIdx : 0;

  dayChips.forEach((chip, i) => {
    chip.classList.remove('active-day', 'today-chip');
    if (i === activeDayIndex) chip.classList.add('active-day');
    if (days[i] === todayKey) chip.classList.add('today-chip');
  });
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
      const html = subjects.map(code => {
        const c = code.trim();
        const subjectName = subjectFull[c] || c;
        const icon = iconMap[c] || iconMap.default;

        return `<div class="subject-row">
          <span class="subject-code">${c}</span>
          <span class="subject-name">${subjectName}</span>
          <div class="row-icon">${icon}</div>
        </div>`;
      }).join('');

      dayScheduleDiv.innerHTML = html;
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
      dayChips.forEach((c, j) => c.classList.toggle('active-day', j === i));
      renderTimetable();
    });
  });

  // View toggle buttons
  btnSchool.addEventListener('click', () => setView('school'));
  btnStudy.addEventListener('click', () => setView('study'));

  console.log('Event handlers initialized');
}

// Splash screen
export function initSplash() {
  const splash = document.getElementById('splash');
  setTimeout(() => splash.classList.add('hidden'), 1200);
}