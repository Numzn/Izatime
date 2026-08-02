import {
  todayKey, minutesFromHHMM, nowHHMM, diffInDays, formatDayLabel,
} from '../core/dates.js';
import { getNextSession, getSessionsForDate } from '../services/scheduler.js';
import { getAssignmentsDueWithin, getUpcomingAssessments } from '../services/assignments.js';
import { getRecommendations } from '../services/aiCoach.js';
import { escapeHtml, delegate } from '../components/dom.js';
import { iconMarkup } from '../components/icons.js';

const TYPE_ICON = { school: 'graduation-cap', study: 'book', 'exam-prep': 'file-text' };
const ASSESSMENT_LABEL = {
  quiz: 'Quiz', test: 'Test', exam: 'Exam', practical: 'Practical',
};

let countdownTimer = null;

function subjectName(state, id) {
  return state.subjects.find((s) => s.id === id)?.name || 'General';
}

function formatCountdown(minsAway) {
  if (minsAway <= 0) return 'Starting now';
  if (minsAway < 60) return `in ${minsAway}m`;
  const hours = Math.floor(minsAway / 60);
  const mins = minsAway % 60;
  return mins ? `in ${hours}h ${mins}m` : `in ${hours}h`;
}

function updateCountdownDOM(container, next, dateKey) {
  const slot = container.querySelector('#nextClassCountdown');
  if (!slot || !next) return;
  if (next.dateKey !== dateKey) {
    slot.textContent = formatDayLabel(next.dateKey).split(',')[0];
    return;
  }
  const minsAway = minutesFromHHMM(next.session.startTime) - minutesFromHHMM(nowHHMM());
  slot.textContent = formatCountdown(minsAway);
}

export function destroy() {
  clearInterval(countdownTimer);
  countdownTimer = null;
}

export function render(container, { state, navigate }) {
  destroy();

  const dateKey = todayKey();
  const nowMinutes = minutesFromHHMM(nowHHMM());
  const next = getNextSession(state, { fromDateKey: dateKey, fromMinutes: nowMinutes });

  const remainingToday = getSessionsForDate(state, dateKey).filter(
    (entry) => !entry.completed && minutesFromHHMM(entry.session.startTime) > nowMinutes && entry.session.id !== next?.session.id,
  );

  const dueAssignments = getAssignmentsDueWithin(state, 2, dateKey).map((a) => ({
    kind: 'assignment', date: a.dueDate, title: a.title, subjectId: a.subjectId, id: a.id,
  }));
  const dueAssessments = getUpcomingAssessments(state, 7, dateKey).map((a) => ({
    kind: 'assessment', date: a.date, title: a.name, subjectId: a.subjectId, id: a.id, assessmentKind: a.kind,
  }));
  const dueSoon = [...dueAssignments, ...dueAssessments].sort((a, b) => a.date.localeCompare(b.date));

  const suggestion = getRecommendations(state, dateKey, nowMinutes)[0] || null;

  container.innerHTML = `
    <section class="today-hero">
      ${next ? `
        <button class="next-class-card" data-action="open-subject" data-subject="${next.session.subjectId || ''}">
          <div class="next-class-icon">${iconMarkup(TYPE_ICON[next.session.type] || 'book', { size: 20 })}</div>
          <div class="next-class-body">
            <span class="next-class-label">Next class</span>
            <span class="next-class-title">${escapeHtml(next.session.title)}</span>
            <span class="next-class-meta">${escapeHtml(subjectName(state, next.session.subjectId))}${next.session.room ? ` · ${escapeHtml(next.session.room)}` : ''}${next.session.lecturer ? ` · ${escapeHtml(next.session.lecturer)}` : ''}</span>
          </div>
          <span class="next-class-countdown" id="nextClassCountdown">—</span>
        </button>
      ` : `
        <div class="empty-state">
          <p>Nothing on your timetable right now.</p>
          <button class="btn btn-primary" data-action="go-timetable">Open timetable</button>
        </div>
      `}
    </section>

    ${remainingToday.length ? `
    <section class="dash-section">
      <h2>Later today</h2>
      <div class="mini-agenda">
        ${remainingToday.map(({ session }) => `
          <button class="mini-agenda-row" data-action="open-subject" data-subject="${session.subjectId || ''}">
            <span class="mini-agenda-time">${session.startTime}</span>
            <span class="mini-agenda-title">${escapeHtml(session.title)}</span>
            <span class="mini-agenda-sub">${escapeHtml(subjectName(state, session.subjectId))}</span>
          </button>
        `).join('')}
      </div>
    </section>` : ''}

    ${dueSoon.length ? `
    <section class="dash-section">
      <h2>Due soon</h2>
      <div class="due-list">
        ${dueSoon.map((item) => {
          const daysLeft = diffInDays(dateKey, item.date);
          const dueLabel = daysLeft <= 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d`;
          const typeLabel = item.kind === 'assignment' ? 'Assignment' : ASSESSMENT_LABEL[item.assessmentKind] || 'Assessment';
          return `
            <button class="due-row" data-action="open-subject" data-subject="${item.subjectId || ''}">
              <span class="due-chip due-chip-${item.kind}">${typeLabel}</span>
              <span class="due-title">${escapeHtml(item.title)}</span>
              <span class="due-when">${dueLabel}</span>
            </button>
          `;
        }).join('')}
      </div>
    </section>` : ''}

    ${suggestion ? `
      <button class="today-suggestion" data-action="open-subject" data-subject="${suggestion.action.subjectId || ''}">
        ${iconMarkup(suggestion.icon, { size: 15 })}
        <span>${escapeHtml(suggestion.title)}</span>
      </button>
    ` : ''}
  `;

  updateCountdownDOM(container, next, dateKey);
  if (next) countdownTimer = setInterval(() => updateCountdownDOM(container, next, dateKey), 60000);

  delegate(container, 'click', '[data-action]', (event, target) => {
    const { action, subject } = target.dataset;
    if (action === 'go-timetable') navigate('timetable');
    else if (action === 'open-subject') navigate('subjects', { subjectId: subject || null });
  });
}
