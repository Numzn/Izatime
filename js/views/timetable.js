import {
  todayKey, WEEK_ORDER, dayCodeOf, addDays, minutesFromHHMM, keyToDate, dateToKey, mondayOf,
} from '../core/dates.js';
import { mutate } from '../core/store.js';
import { getSessionsForDate, toggleCompletion } from '../services/scheduler.js';
import { getAssignmentsDueOn, getAssessmentsOn } from '../services/assignments.js';
import { escapeHtml, delegate } from '../components/dom.js';
import { openSessionForm } from '../components/sessionForm.js';
import { iconMarkup } from '../components/icons.js';
import { vibrate, PATTERNS } from '../services/haptics.js';

const TYPE_ICON = { school: 'graduation-cap', study: 'book', 'exam-prep': 'file-text' };
const ASSESSMENT_KIND_LABEL = { quiz: 'Quiz', test: 'Test', exam: 'Exam', practical: 'Practical' };

function addMonths(dateKey, n) {
  const d = keyToDate(dateKey);
  d.setMonth(d.getMonth() + n, 1);
  return dateToKey(d);
}

function monthLabel(dateKey) {
  return keyToDate(dateKey).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// Full 7-wide weeks covering the month, Monday-aligned, so leading/trailing
// days from adjacent months fill out the grid rather than leaving gaps.
function monthGridDays(dateKey) {
  const d = keyToDate(dateKey);
  const firstKey = dateToKey(new Date(d.getFullYear(), d.getMonth(), 1));
  const lastKey = dateToKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const gridStart = mondayOf(firstKey);
  const gridEnd = addDays(mondayOf(lastKey), 6);
  const days = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}

const viewState = {
  mode: 'week', weekStart: mondayOf(todayKey()), monthAnchor: todayKey(), selectedDate: todayKey(),
};

function dayPreview(state, dateKey) {
  const classes = getSessionsForDate(state, dateKey);
  const dueCount = getAssignmentsDueOn(state, dateKey).length + getAssessmentsOn(state, dateKey).length;
  return { classCount: classes.length, dueCount };
}

function buildAgenda(state, dateKey) {
  const items = [];
  getSessionsForDate(state, dateKey).forEach(({ session, completed }) => {
    items.push({
      kind: 'class', sortKey: session.startTime, session, completed,
    });
  });
  getAssignmentsDueOn(state, dateKey).forEach((a) => {
    items.push({ kind: 'assignment', sortKey: a.dueTime || '00:00', assignment: a });
  });
  getAssessmentsOn(state, dateKey).forEach((a) => {
    items.push({ kind: 'assessment', sortKey: a.startTime || '00:00', assessment: a });
  });
  return items.sort((a, b) => minutesFromHHMM(a.sortKey) - minutesFromHHMM(b.sortKey));
}

function subjectName(state, id) {
  return state.subjects.find((s) => s.id === id)?.name || 'General';
}

function renderWeekBlock(state, today) {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(viewState.weekStart, i));
  return `
    <div class="section-header">
      <h2>${viewState.weekStart === mondayOf(today) ? 'This week' : `Week of ${viewState.weekStart}`}</h2>
      <div class="week-nav">
        <button class="icon-btn icon-flip" data-action="prev-week" aria-label="Previous week">${iconMarkup('chevron-right', { size: 14 })}</button>
        <button class="btn-chip" data-action="go-today">Today</button>
        <button class="icon-btn" data-action="next-week" aria-label="Next week">${iconMarkup('chevron-right', { size: 14 })}</button>
      </div>
    </div>
    <div class="week-strip">
      ${weekDays.map((dateKey) => {
        const preview = dayPreview(state, dateKey);
        return `
          <button class="week-day${dateKey === viewState.selectedDate ? ' selected' : ''}${dateKey === today ? ' is-today' : ''}" data-select-day="${dateKey}">
            <span class="week-day-name">${dayCodeOf(dateKey)[0]}${dayCodeOf(dateKey).slice(1).toLowerCase()}</span>
            <span class="week-day-num">${Number(dateKey.slice(8, 10))}</span>
            <span class="week-day-preview">${preview.classCount ? preview.classCount : ''}${preview.dueCount ? ` ${iconMarkup('edit', { size: 9 })}` : ''}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function renderMonthBlock(state, today) {
  const monthKey = viewState.monthAnchor.slice(0, 7);
  const days = monthGridDays(viewState.monthAnchor);
  return `
    <div class="section-header">
      <h2>${monthLabel(viewState.monthAnchor)}</h2>
      <div class="week-nav">
        <button class="icon-btn icon-flip" data-action="prev-month" aria-label="Previous month">${iconMarkup('chevron-right', { size: 14 })}</button>
        <button class="btn-chip" data-action="go-today">Today</button>
        <button class="icon-btn" data-action="next-month" aria-label="Next month">${iconMarkup('chevron-right', { size: 14 })}</button>
      </div>
    </div>
    <div class="month-weekday-row">${WEEK_ORDER.map((code) => `<span>${code[0]}</span>`).join('')}</div>
    <div class="month-grid">
      ${days.map((dateKey) => {
        const preview = dayPreview(state, dateKey);
        const inMonth = dateKey.slice(0, 7) === monthKey;
        const hasItems = preview.classCount > 0 || preview.dueCount > 0;
        return `
          <button class="month-cell${dateKey === viewState.selectedDate ? ' selected' : ''}${dateKey === today ? ' is-today' : ''}${inMonth ? '' : ' outside-month'}" data-select-day="${dateKey}">
            <span class="month-cell-num">${Number(dateKey.slice(8, 10))}</span>
            ${hasItems ? '<span class="month-cell-dot"></span>' : ''}
          </button>`;
      }).join('')}
    </div>`;
}

export function render(container, { state, navigate }) {
  const agenda = buildAgenda(state, viewState.selectedDate);
  const today = todayKey();

  container.innerHTML = `
    <section class="dash-section timetable-week">
      <div class="range-toggle timetable-mode-toggle">
        <button class="btn-chip${viewState.mode === 'week' ? ' active' : ''}" data-mode="week">Week</button>
        <button class="btn-chip${viewState.mode === 'month' ? ' active' : ''}" data-mode="month">Month</button>
      </div>
      ${viewState.mode === 'week' ? renderWeekBlock(state, today) : renderMonthBlock(state, today)}
    </section>

    <section class="dash-section">
      <div class="section-header"><h2>${viewState.selectedDate === today ? 'Today' : viewState.selectedDate}</h2><button class="btn-chip" data-action="add-class">+ Add class</button></div>
      ${agenda.length ? `
        <div class="agenda-list">
          ${agenda.map((item) => {
            if (item.kind === 'class') {
              const { session, completed } = item;
              return `
                <div class="session-row editable${completed ? ' completed' : ''}">
                  <input type="checkbox" data-toggle-session="${session.id}" ${completed ? 'checked' : ''}>
                  <span class="session-icon">${iconMarkup(TYPE_ICON[session.type] || 'book', { size: 15 })}</span>
                  <span class="session-info" data-edit-class="${session.id}">
                    <span class="session-title">${escapeHtml(session.title)}${session.recurrence ? ` ${iconMarkup('repeat', { size: 11 })}` : ''}</span>
                    <span class="session-meta">${session.startTime} · ${escapeHtml(subjectName(state, session.subjectId))}${session.room ? ` · ${escapeHtml(session.room)}` : ''}${session.lecturer ? ` · ${escapeHtml(session.lecturer)}` : ''}</span>
                  </span>
                </div>`;
            }
            if (item.kind === 'assignment') {
              return `
                <button class="due-row" data-action="open-subject" data-subject="${item.assignment.subjectId || ''}">
                  <span class="due-chip due-chip-assignment">Due</span>
                  <span class="due-title">${escapeHtml(item.assignment.title)}</span>
                  <span class="due-when">${escapeHtml(subjectName(state, item.assignment.subjectId))}</span>
                </button>`;
            }
            return `
              <button class="due-row" data-action="open-subject" data-subject="${item.assessment.subjectId || ''}">
                <span class="due-chip due-chip-assessment">${ASSESSMENT_KIND_LABEL[item.assessment.kind]}</span>
                <span class="due-title">${escapeHtml(item.assessment.name)}</span>
                <span class="due-when">${item.assessment.startTime || ''}</span>
              </button>`;
          }).join('')}
        </div>
      ` : '<p class="empty-state-inline">Nothing scheduled this day.</p>'}
    </section>
  `;

  delegate(container, 'click', '[data-select-day]', (e, t) => {
    viewState.selectedDate = t.dataset.selectDay;
    render(container, { state, navigate });
  });
  delegate(container, 'click', '[data-mode]', (e, t) => {
    viewState.mode = t.dataset.mode;
    render(container, { state, navigate });
  });
  delegate(container, 'click', '[data-action="prev-week"]', () => {
    viewState.weekStart = addDays(viewState.weekStart, -7);
    viewState.selectedDate = viewState.weekStart;
    render(container, { state, navigate });
  });
  delegate(container, 'click', '[data-action="next-week"]', () => {
    viewState.weekStart = addDays(viewState.weekStart, 7);
    viewState.selectedDate = viewState.weekStart;
    render(container, { state, navigate });
  });
  delegate(container, 'click', '[data-action="prev-month"]', () => {
    viewState.monthAnchor = addMonths(viewState.monthAnchor, -1);
    render(container, { state, navigate });
  });
  delegate(container, 'click', '[data-action="next-month"]', () => {
    viewState.monthAnchor = addMonths(viewState.monthAnchor, 1);
    render(container, { state, navigate });
  });
  delegate(container, 'click', '[data-action="go-today"]', () => {
    viewState.weekStart = mondayOf(today);
    viewState.monthAnchor = today;
    viewState.selectedDate = today;
    render(container, { state, navigate });
  });
  delegate(container, 'click', '[data-action="add-class"]', () => openSessionForm(state, null, { dateKey: viewState.selectedDate }));
  delegate(container, 'click', '[data-edit-class]', (e, t) => openSessionForm(state, state.sessions.find((s) => s.id === t.dataset.editClass)));
  delegate(container, 'click', '[data-action="open-subject"]', (e, t) => navigate('subjects', { subjectId: t.dataset.subject || null }));

  delegate(container, 'change', '[data-toggle-session]', (e, t) => {
    mutate((s) => {
      const session = s.sessions.find((x) => x.id === t.dataset.toggleSession);
      if (session) toggleCompletion(session, viewState.selectedDate);
    });
    if (t.checked && state.settings.hapticsEnabled !== false) vibrate(PATTERNS.confirm);
  });
}
