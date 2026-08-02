import { last7Days, todayKey } from '../core/dates.js';
import { getState } from '../core/store.js';
import { getFocusMinutesForDate } from '../services/analytics.js';
import * as focusTimer from '../services/focusTimer.js';
import { escapeHtml, delegate } from '../components/dom.js';
import { barChart } from '../components/charts.js';
import { showToast } from '../components/toast.js';
import { vibrate, PATTERNS } from '../services/haptics.js';

const PHASE_LABEL = { idle: 'Ready to focus', focus: 'Focus', break: 'Short break', longBreak: 'Long break' };

let unsubscribeTick = null;
let unsubscribePhase = null;

function formatClock(totalSeconds) {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function subjectName(state, id) {
  return state.subjects.find((s) => s.id === id)?.name || null;
}

function updateTimerDOM(container) {
  const snap = focusTimer.getSnapshot();
  const clockEl = container.querySelector('#focusClock');
  const phaseEl = container.querySelector('#focusPhase');
  if (!clockEl || !phaseEl) return;

  const previewSeconds = snap.phase === 'idle' ? getState().settings.focusMinutes * 60 : snap.remainingSeconds;
  clockEl.textContent = formatClock(previewSeconds);
  phaseEl.textContent = PHASE_LABEL[snap.phase] + (snap.isPaused ? ' · Paused' : '');
  container.querySelector('.focus-ring')?.classList.toggle('is-break', snap.phase === 'break' || snap.phase === 'longBreak');

  const startBtn = container.querySelector('[data-focus="start"]');
  const pauseBtn = container.querySelector('[data-focus="pause"]');
  const resumeBtn = container.querySelector('[data-focus="resume"]');
  const resetBtn = container.querySelector('[data-focus="reset"]');
  const subjectSelect = container.querySelector('#focusSubject');

  if (startBtn) startBtn.style.display = snap.phase === 'idle' ? '' : 'none';
  if (pauseBtn) pauseBtn.style.display = snap.phase !== 'idle' && !snap.isPaused ? '' : 'none';
  if (resumeBtn) resumeBtn.style.display = snap.phase !== 'idle' && snap.isPaused ? '' : 'none';
  if (resetBtn) resetBtn.style.display = snap.phase !== 'idle' ? '' : 'none';
  if (subjectSelect) subjectSelect.disabled = snap.phase !== 'idle';
}

export function destroy() {
  unsubscribeTick?.();
  unsubscribePhase?.();
  unsubscribeTick = null;
  unsubscribePhase = null;
}

export function render(container, { state, params }) {
  destroy();

  const dateKey = todayKey();
  const todayFocus = state.focusSessions.filter((f) => f.date === dateKey && f.type === 'focus');
  const history = last7Days().map((d) => ({
    label: d.slice(5).split('-').reverse().join('/'),
    value: getFocusMinutesForDate(state, d),
    highlight: d === dateKey,
  }));

  container.innerHTML = `
    <section class="focus-hero">
      <select id="focusSubject" class="subject-select">
        <option value="">No subject</option>
        ${state.subjects.map((s) => `<option value="${s.id}" ${params?.subjectId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
      </select>

      <div class="focus-ring">
        <div id="focusPhase" class="focus-phase">Ready to focus</div>
        <div id="focusClock" class="focus-clock">25:00</div>
      </div>

      <div class="focus-controls">
        <button class="btn btn-primary" data-focus="start">Start focus</button>
        <button class="btn btn-ghost" data-focus="pause" style="display:none">Pause</button>
        <button class="btn btn-primary" data-focus="resume" style="display:none">Resume</button>
        <button class="btn btn-ghost" data-focus="reset" style="display:none">End session</button>
      </div>
    </section>

    <section class="dash-section">
      <h2>This week</h2>
      <div id="focusChartSlot"></div>
    </section>

    <section class="dash-section">
      <h2>Today's sessions</h2>
      ${todayFocus.length ? `
        <div class="focus-history">
          ${todayFocus.slice().reverse().map((f) => `
            <div class="focus-history-row${f.completed ? '' : ' incomplete'}">
              <span>${subjectName(state, f.subjectId) ? escapeHtml(subjectName(state, f.subjectId)) : 'General focus'}</span>
              <span>${f.actualMinutes}m${f.completed ? '' : ' · stopped early'}</span>
            </div>
          `).join('')}
        </div>
      ` : '<p class="empty-state-inline">No focus sessions yet today. Start one above.</p>'}
    </section>
  `;

  container.querySelector('#focusChartSlot').appendChild(barChart(history, { height: 90 }));

  updateTimerDOM(container);

  unsubscribeTick = focusTimer.onTick(() => updateTimerDOM(container));
  unsubscribePhase = focusTimer.onPhaseComplete(({ phase, next }) => {
    if (state.settings.hapticsEnabled !== false) vibrate(PATTERNS.success);
    if (phase === 'focus') showToast(next === 'longBreak' ? 'Focus block complete — long break time' : 'Focus block complete — short break');
    else showToast('Break over — ready when you are');
  });

  delegate(container, 'click', '[data-focus]', (event, target) => {
    const action = target.dataset.focus;
    if (action === 'start') {
      const subjectId = container.querySelector('#focusSubject').value || null;
      focusTimer.start(subjectId);
    } else if (action === 'pause') focusTimer.pause();
    else if (action === 'resume') focusTimer.resume();
    else if (action === 'reset') focusTimer.stop();
    updateTimerDOM(container);
  });
}
