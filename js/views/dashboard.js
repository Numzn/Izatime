import {
  todayKey, minutesFromHHMM, minutesToHHMM, nowHHMM, diffInDays, formatDueLabel,
} from '../core/dates.js';
import { getNextSession, getCurrentSession, getSessionsForDate } from '../services/scheduler.js';
import { getAssignmentsDueSoonOrOverdue, getUpcomingAssessments } from '../services/assignments.js';
import { getLastActiveDate } from '../services/aiCoach.js';
import { getSubjectPerformance } from '../services/analytics.js';
import { getDueFlashcards } from '../services/spacedRepetition.js';
import { getCurrentAccount } from '../core/store.js';
import { escapeHtml, delegate, clearDelegated } from '../components/dom.js';
import { iconMarkup } from '../components/icons.js';

// The Home screen answers exactly five questions, one section each, in
// this order: where am I, what's happening today, what's next, what needs
// my attention, and where do I continue. Nothing else lives here — no
// stats, no "view all" links, no decorative cards. An empty state should
// read as quiet, not as a screen apologizing for having nothing to show.
let refreshTimer = null;

function greetingWord() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName() {
  const account = getCurrentAccount();
  return account?.name ? account.name.split(' ')[0] : null;
}

function keyToDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatFullDate(dateKey) {
  return keyToDate(dateKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function weekdayName(dateKey) {
  return keyToDate(dateKey).toLocaleDateString('en-GB', { weekday: 'long' });
}

function endTimeOf(session) {
  return minutesToHHMM(minutesFromHHMM(session.startTime) + session.durationMinutes);
}

function subjectName(state, id) {
  return state.subjects.find((s) => s.id === id)?.name || 'General';
}

export function destroy() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}

// ---- 2. What's happening today ----
function renderToday(state, dateKey, nowMinutes, current, upcoming) {
  if (current) {
    return `
      <div class="home-today-card">
        <div class="home-today-heading">${escapeHtml(subjectName(state, current.session.subjectId))} · ${escapeHtml(current.session.title)}</div>
        <div class="home-today-time">${current.session.startTime}–${endTimeOf(current.session)}</div>
        <div class="home-status"><span class="home-status-dot"></span>Class in progress</div>
        <button class="btn btn-primary home-today-action" data-action="open-subject" data-subject="${current.session.subjectId || ''}">Open class</button>
      </div>
    `;
  }

  const todaysRemaining = getSessionsForDate(state, dateKey).filter(
    (entry) => !entry.completed && minutesFromHHMM(entry.session.startTime) > nowMinutes,
  );

  if (todaysRemaining.length) {
    const count = todaysRemaining.length === 1 ? '1 more class today' : `${todaysRemaining.length} more classes today`;
    return `<p class="home-line">${count} · next at ${todaysRemaining[0].session.startTime}</p>`;
  }

  if (!upcoming) return '<p class="home-line">No classes today.</p>';

  const when = upcoming.dateKey === dateKey ? `today at ${upcoming.session.startTime}` : `${weekdayName(upcoming.dateKey)} at ${upcoming.session.startTime}`;
  return `
    <p class="home-line">No classes today</p>
    <p class="home-line home-line-muted">Next class ${when}</p>
  `;
}

// ---- 3. What's next ----
function renderNextClass(state, dateKey, upcoming) {
  if (!upcoming) return '';
  const { session } = upcoming;
  const when = upcoming.dateKey === dateKey ? 'Today' : weekdayName(upcoming.dateKey);
  return `
    <section class="home-section">
      <h2 class="home-heading">Next class</h2>
      <button class="home-next-card" data-action="open-subject" data-subject="${session.subjectId || ''}">
        <div class="home-next-subject">${escapeHtml(subjectName(state, session.subjectId))}</div>
        <div class="home-next-meta">${escapeHtml(session.title)} · ${when} · ${session.startTime}–${endTimeOf(session)}</div>
        ${session.room ? `<div class="home-next-meta">${escapeHtml(session.room)}</div>` : ''}
      </button>
    </section>
  `;
}

// ---- 4. What needs my attention ----
function attentionItems(state, dateKey, nowMinutes) {
  const items = [];

  getAssignmentsDueSoonOrOverdue(state, 2, dateKey).forEach((a) => {
    const daysLeft = diffInDays(dateKey, a.dueDate);
    items.push({
      urgency: daysLeft < 0 ? 3 : daysLeft === 0 ? 2 : 1,
      render: () => `
        <button class="home-attention-row" data-open-assignment="${a.id}" data-subject="${a.subjectId || ''}">
          <span class="home-attention-eyebrow${daysLeft < 0 ? ' home-attention-overdue' : ''}">${daysLeft < 0 ? `Assignment ${formatDueLabel(daysLeft)}` : daysLeft === 0 ? 'Assignment due today' : `Assignment due ${formatDueLabel(daysLeft).toLowerCase()}`}</span>
          <span class="home-attention-title">${escapeHtml(a.title)}</span>
          <span class="home-attention-sub">${escapeHtml(subjectName(state, a.subjectId))}</span>
        </button>
      `,
    });
  });

  getUpcomingAssessments(state, 2, dateKey).forEach((a) => {
    const daysLeft = diffInDays(dateKey, a.date);
    items.push({
      urgency: daysLeft === 0 ? 2 : 1,
      render: () => `
        <button class="home-attention-row" data-open-assessment="${a.id}" data-subject="${a.subjectId || ''}">
          <span class="home-attention-eyebrow">${daysLeft === 0 ? 'Assessment today' : `Assessment ${formatDueLabel(daysLeft).toLowerCase()}`}</span>
          <span class="home-attention-title">${escapeHtml(a.name)}</span>
          <span class="home-attention-sub">${escapeHtml(subjectName(state, a.subjectId))}</span>
        </button>
      `,
    });
  });

  // Only today's own elapsed-and-unmarked classes — not a multi-day
  // backlog. Whether attendance should default to "marked" once a class
  // elapses is a separate, still-open product question; this just makes
  // today's gap visible without pre-deciding that policy.
  const unmarked = getSessionsForDate(state, dateKey).filter(
    (entry) => !entry.completed && minutesFromHHMM(entry.session.startTime) + entry.session.durationMinutes <= nowMinutes,
  );
  if (unmarked.length) {
    const first = unmarked[0].session;
    items.push({
      urgency: 0,
      render: () => `
        <button class="home-attention-row" data-action="open-subject" data-subject="${first.subjectId || ''}">
          <span class="home-attention-eyebrow">${unmarked.length === 1 ? "1 class hasn't been marked" : `${unmarked.length} classes haven't been marked`}</span>
          <span class="home-attention-title">${escapeHtml(subjectName(state, first.subjectId))} · ${escapeHtml(first.title)}</span>
          <span class="home-attention-sub">${weekdayName(dateKey)}</span>
          <span class="home-attention-link">Review ${iconMarkup('chevron-right', { size: 13 })}</span>
        </button>
      `,
    });
  }

  return items.sort((a, b) => b.urgency - a.urgency).slice(0, 3);
}

function renderAttention(state, dateKey, nowMinutes) {
  const items = attentionItems(state, dateKey, nowMinutes);
  if (!items.length) return '';
  return `
    <section class="home-section">
      <h2 class="home-heading">Needs attention</h2>
      <div class="home-attention-list">${items.map((item) => item.render()).join('')}</div>
    </section>
  `;
}

// ---- 5. Where do I continue ----
function renderContinue(state) {
  if (!state.subjects.length) return '';

  let best = null;
  state.subjects.forEach((subject) => {
    const last = getLastActiveDate(state, subject.id);
    if (last && (!best || last > best.last)) best = { subject, last };
  });
  if (!best) return '';

  const performance = getSubjectPerformance(state, 14).find((p) => p.subject.id === best.subject.id);
  const dueCards = getDueFlashcards(state).filter((c) => c.subjectId === best.subject.id);
  const recentNote = state.notes
    .filter((n) => n.subjectId === best.subject.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  let whatLine = 'Continue studying';
  if (dueCards.length) whatLine = dueCards.length === 1 ? 'Review 1 flashcard' : `Review ${dueCards.length} flashcards`;
  else if (recentNote) whatLine = `Review ${recentNote.title}`;

  return `
    <section class="home-section">
      <h2 class="home-heading">Continue studying</h2>
      <button class="home-continue-card" data-action="open-subject" data-subject="${best.subject.id}">
        <span class="home-continue-text">
          <span class="home-continue-subject">${escapeHtml(best.subject.name)}</span>
          <span class="home-continue-what">${escapeHtml(whatLine)}</span>
        </span>
        <span class="home-continue-progress">${performance?.completionPct != null ? `${performance.completionPct}%` : ''}${iconMarkup('chevron-right', { size: 15 })}</span>
      </button>
    </section>
  `;
}

export function render(container, { state, navigate }) {
  destroy();
  clearDelegated(container);
  const scrollTop = container.scrollTop;

  const dateKey = todayKey();
  const nowMinutes = minutesFromHHMM(nowHHMM());
  const current = getCurrentSession(state, dateKey, nowMinutes);
  // Search for "next" starting after the in-progress class ends, if one
  // exists, so it isn't shown twice (once as current, once as next).
  const searchFromMinutes = current ? minutesFromHHMM(current.session.startTime) + current.session.durationMinutes : nowMinutes;
  const upcoming = getNextSession(state, { fromDateKey: dateKey, fromMinutes: searchFromMinutes });

  const name = firstName();

  container.innerHTML = `
    <div class="home-greeting">
      <div class="home-greeting-text">${greetingWord()}${name ? `, ${escapeHtml(name)}` : ''}</div>
      <div class="home-date">${formatFullDate(dateKey)}</div>
    </div>

    <section class="home-section">
      <h2 class="home-heading">Today</h2>
      ${renderToday(state, dateKey, nowMinutes, current, upcoming)}
    </section>

    ${renderNextClass(state, dateKey, upcoming)}
    ${renderAttention(state, dateKey, nowMinutes)}
    ${renderContinue(state)}
  `;

  container.scrollTop = scrollTop;

  // Everything above is only ever computed at render time. A class
  // starting or ending, an assignment tipping into "due today" — none of
  // that updates on its own if this screen is just left open. Re-running
  // the whole render on a light interval keeps it honest without needing
  // per-field patch logic for every section.
  refreshTimer = setInterval(() => render(container, { state, navigate }), 60000);

  delegate(container, 'click', '[data-action="open-subject"], [data-open-assignment], [data-open-assessment]', (event, target) => {
    navigate('subjects', { subjectId: target.dataset.subject || null });
  });
}
