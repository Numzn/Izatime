import {
  todayKey, minutesFromHHMM, nowHHMM, diffInDays, formatDayLabel, formatDueLabel,
} from '../core/dates.js';
import { getNextSession, getCurrentSession, getSessionsForDate } from '../services/scheduler.js';
import { getAssignmentsDueSoonOrOverdue, getUpcomingAssessments } from '../services/assignments.js';
import { getNextFreePeriod } from '../services/freeTime.js';
import { getRecommendations } from '../services/aiCoach.js';
import { escapeHtml, delegate, clearDelegated } from '../components/dom.js';
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

function formatEndsIn(minsLeft) {
  if (minsLeft <= 0) return 'Ending now';
  if (minsLeft < 60) return `ends in ${minsLeft}m`;
  const hours = Math.floor(minsLeft / 60);
  const mins = minsLeft % 60;
  return mins ? `ends in ${hours}h ${mins}m` : `ends in ${hours}h`;
}

function updateCountdownDOM(container, hero, dateKey) {
  const slot = container.querySelector('#nextClassCountdown');
  if (!slot || !hero) return;
  if (hero.isCurrent) {
    const end = minutesFromHHMM(hero.session.startTime) + hero.session.durationMinutes;
    slot.textContent = formatEndsIn(end - minutesFromHHMM(nowHHMM()));
    return;
  }
  if (hero.dateKey !== dateKey) {
    slot.textContent = formatDayLabel(hero.dateKey).split(',')[0];
    return;
  }
  const minsAway = minutesFromHHMM(hero.session.startTime) - minutesFromHHMM(nowHHMM());
  slot.textContent = formatCountdown(minsAway);
}

export function destroy() {
  clearInterval(countdownTimer);
  countdownTimer = null;
}

export function render(container, { state, navigate }) {
  destroy();
  clearDelegated(container);
  const scrollTop = container.scrollTop;

  const dateKey = todayKey();
  const nowMinutes = minutesFromHHMM(nowHHMM());
  const current = getCurrentSession(state, dateKey, nowMinutes);
  // Only look ahead for "next" when nothing's happening right now — a
  // class in progress is what the hero should show, not what comes after
  // it (see getCurrentSession's doc comment).
  const next = current ? null : getNextSession(state, { fromDateKey: dateKey, fromMinutes: nowMinutes });
  const hero = current ? { session: current.session, dateKey, isCurrent: true } : (next ? { ...next, isCurrent: false } : null);

  const remainingToday = getSessionsForDate(state, dateKey).filter(
    (entry) => !entry.completed && minutesFromHHMM(entry.session.startTime) > nowMinutes && entry.session.id !== next?.session.id,
  );

  const dueAssignments = getAssignmentsDueSoonOrOverdue(state, 2, dateKey).map((a) => ({
    kind: 'assignment', date: a.dueDate, title: a.title, subjectId: a.subjectId, id: a.id,
  }));
  const dueAssessments = getUpcomingAssessments(state, 7, dateKey).map((a) => ({
    kind: 'assessment', date: a.date, title: a.name, subjectId: a.subjectId, id: a.id, assessmentKind: a.kind,
  }));
  const dueSoon = [...dueAssignments, ...dueAssessments].sort((a, b) => a.date.localeCompare(b.date));

  const suggestion = getRecommendations(state, dateKey, nowMinutes)[0] || null;
  const freePeriod = getNextFreePeriod(state, dateKey, { fromMinutes: nowMinutes });

  container.innerHTML = `
    <section class="today-hero">
      ${hero ? `
        <button class="next-class-card${hero.isCurrent ? ' is-current' : ''}" data-action="open-subject" data-subject="${hero.session.subjectId || ''}">
          <div class="next-class-icon">${iconMarkup(TYPE_ICON[hero.session.type] || 'book', { size: 20 })}</div>
          <div class="next-class-body">
            <span class="next-class-label">${hero.isCurrent ? 'In progress' : 'Next class'}</span>
            <span class="next-class-title">${escapeHtml(hero.session.title)}</span>
            <span class="next-class-meta">${escapeHtml(subjectName(state, hero.session.subjectId))}${hero.session.room ? ` · ${escapeHtml(hero.session.room)}` : ''}${hero.session.lecturer ? ` · ${escapeHtml(hero.session.lecturer)}` : ''}</span>
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

    ${freePeriod ? `
      <div class="free-period-note">
        ${iconMarkup('hourglass', { size: 14 })}
        <span>Free ${freePeriod.startTime}–${freePeriod.endTime}${freePeriod.beforeSession ? ` before ${escapeHtml(freePeriod.beforeSession.title)}` : ''}</span>
      </div>
    ` : ''}

    ${dueSoon.length ? `
    <section class="dash-section">
      <h2>Due soon</h2>
      <div class="due-list">
        ${dueSoon.map((item) => {
          const daysLeft = diffInDays(dateKey, item.date);
          const dueLabel = formatDueLabel(daysLeft);
          const typeLabel = item.kind === 'assignment' ? 'Assignment' : ASSESSMENT_LABEL[item.assessmentKind] || 'Assessment';
          return `
            <button class="due-row" data-action="open-subject" data-subject="${item.subjectId || ''}">
              <span class="due-chip due-chip-${item.kind}">${typeLabel}</span>
              <span class="due-title">${escapeHtml(item.title)}</span>
              <span class="due-when${daysLeft < 0 ? ' due-when-overdue' : ''}">${dueLabel}</span>
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

  container.scrollTop = scrollTop;
  updateCountdownDOM(container, hero, dateKey);

  // `next`, remainingToday, dueSoon, freePeriod and suggestion are all only
  // ever computed at render time. Patching just the countdown text on a
  // tick left everything else stale on a screen left open — including the
  // countdown itself once minsAway went negative (formatCountdown just
  // says "Starting now" forever for any minsAway <= 0, so a class in
  // progress, or one that ended an hour ago, looked identical). Re-running
  // the whole render re-derives all of it from the current clock; each
  // call schedules its own next tick via destroy() above.
  countdownTimer = setInterval(() => render(container, { state, navigate }), 60000);

  delegate(container, 'click', '[data-action]', (event, target) => {
    const { action, subject } = target.dataset;
    if (action === 'go-timetable') navigate('timetable');
    else if (action === 'open-subject') navigate('subjects', { subjectId: subject || null });
  });
}
