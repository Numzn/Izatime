import { todayKey, minutesFromHHMM, nowHHMM } from '../core/dates.js';
import { mutate } from '../core/store.js';
import { getSessionsForDate, getNextSession, toggleCompletion } from '../services/scheduler.js';
import { getDailyGoalProgress, getFocusMinutesForDate } from '../services/analytics.js';
import { getRecommendations, getDailyTip } from '../services/aiCoach.js';
import { escapeHtml, delegate } from '../components/dom.js';
import { ringChart } from '../components/charts.js';

const TYPE_ICON = { school: '🏫', study: '📘', 'exam-prep': '📝' };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function subjectName(state, id) {
  return state.subjects.find((s) => s.id === id)?.name || 'General';
}

export function render(container, { state, navigate }) {
  const dateKey = todayKey();
  const entries = getSessionsForDate(state, dateKey);
  const done = entries.filter((e) => e.completed).length;
  const next = getNextSession(state, { fromDateKey: dateKey, fromMinutes: minutesFromHHMM(nowHHMM()) });
  const goal = getDailyGoalProgress(state, dateKey);
  const focusMinutes = getFocusMinutesForDate(state, dateKey);
  const recs = getRecommendations(state, dateKey);
  const tip = getDailyTip(state, dateKey);

  container.innerHTML = `
    <section class="dash-hero">
      <div>
        <h1>${greeting()}${state.subjects.length ? '' : ', welcome'}</h1>
        <p class="dash-date">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      <div class="streak-badge" title="Current streak">
        <span class="streak-flame">🔥</span>
        <strong>${state.streak.current}</strong>
        <span>day${state.streak.current === 1 ? '' : 's'}</span>
      </div>
    </section>

    <section class="dash-stats">
      <div class="stat-card stat-ring" id="goalRingSlot"><span class="stat-caption">Today's goal</span></div>
      <div class="stat-card">
        <div class="stat-number">${focusMinutes}<span class="stat-unit">m</span></div>
        <span class="stat-caption">Focus time</span>
      </div>
      <div class="stat-card">
        <div class="stat-number">${done}/${entries.length}</div>
        <span class="stat-caption">Sessions done</span>
      </div>
    </section>

    ${next ? `
    <section class="dash-section">
      <h2>Next up</h2>
      <button class="next-card" data-action="go-focus" data-subject="${next.session.subjectId || ''}">
        <div class="next-icon">${TYPE_ICON[next.session.type] || '📘'}</div>
        <div class="next-info">
          <div class="next-title">${escapeHtml(next.session.title)}</div>
          <div class="next-meta">${escapeHtml(subjectName(state, next.session.subjectId))} · ${next.session.startTime}${next.dateKey !== dateKey ? ' · ' + next.dateKey : ''}</div>
        </div>
        <div class="next-chevron">›</div>
      </button>
    </section>` : ''}

    ${recs.length ? `
    <section class="dash-section">
      <h2>✨ AI Coach</h2>
      <div class="rec-list">
        ${recs.map((r) => `
          <button class="rec-card" data-action="${r.action.type}" data-subject="${r.action.subjectId || ''}">
            <span class="rec-icon">${r.icon}</span>
            <span class="rec-body">
              <span class="rec-title">${escapeHtml(r.title)}</span>
              <span class="rec-detail">${escapeHtml(r.detail)}</span>
            </span>
          </button>
        `).join('')}
      </div>
    </section>` : ''}

    <section class="dash-section">
      <h2>Today's plan</h2>
      ${entries.length ? `
        <div class="session-list">
          ${entries.map(({ session, completed }) => `
            <label class="session-row${completed ? ' completed' : ''}">
              <input type="checkbox" data-toggle-session="${session.id}" data-date="${dateKey}" ${completed ? 'checked' : ''}>
              <span class="session-icon">${TYPE_ICON[session.type] || '📘'}</span>
              <span class="session-info">
                <span class="session-title">${escapeHtml(session.title)}</span>
                <span class="session-meta">${escapeHtml(subjectName(state, session.subjectId))} · ${session.startTime}</span>
              </span>
            </label>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <p>Nothing scheduled for today.</p>
          <button class="btn btn-primary" data-action="go-planner">Plan your day</button>
        </div>
      `}
    </section>

    <p class="dash-tip">${escapeHtml(tip)}</p>
  `;

  const ringSlot = container.querySelector('#goalRingSlot');
  ringSlot.prepend(ringChart(goal.pct, { label: `${goal.minutes}m` }));

  delegate(container, 'change', '[data-toggle-session]', (event, target) => {
    const sessionId = target.dataset.toggleSession;
    const dateForToggle = target.dataset.date;
    mutate((s) => {
      const session = s.sessions.find((sess) => sess.id === sessionId);
      if (session) toggleCompletion(session, dateForToggle);
    });
  });

  delegate(container, 'click', '[data-action]', (event, target) => {
    const { action, subject } = target.dataset;
    if (action === 'go-planner') navigate('planner', { subjectId: subject || null });
    else if (action === 'go-focus') navigate('focus', { subjectId: subject || null });
    else if (action === 'go-hub') navigate('hub', { subjectId: subject || null });
  });
}
