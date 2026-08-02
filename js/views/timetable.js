import {
  todayKey, WEEK_ORDER, dayCodeOf, addDays, minutesFromHHMM,
} from '../core/dates.js';
import { mutate } from '../core/store.js';
import { createSession } from '../core/models.js';
import { getSessionsForDate, toggleCompletion } from '../services/scheduler.js';
import { getAssignmentsDueOn, getAssessmentsOn } from '../services/assignments.js';
import { escapeHtml, delegate } from '../components/dom.js';
import { openModal, confirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { iconMarkup } from '../components/icons.js';

const TYPE_LABEL = { school: 'School', study: 'Study', 'exam-prep': 'Exam prep' };
const TYPE_ICON = { school: 'graduation-cap', study: 'book', 'exam-prep': 'file-text' };
const ASSESSMENT_KIND_LABEL = { quiz: 'Quiz', test: 'Test', exam: 'Exam', practical: 'Practical' };

function mondayOf(dateKey) {
  return addDays(dateKey, -WEEK_ORDER.indexOf(dayCodeOf(dateKey)));
}

const viewState = { weekStart: mondayOf(todayKey()), selectedDate: todayKey() };

function field(labelText, inputEl) {
  const wrap = document.createElement('label');
  wrap.className = 'form-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  wrap.appendChild(span);
  wrap.appendChild(inputEl);
  return wrap;
}

function textInput(value = '', placeholder = '') {
  const i = document.createElement('input');
  i.type = 'text'; i.value = value; i.placeholder = placeholder;
  return i;
}

function selectInput(options, value) {
  const select = document.createElement('select');
  options.forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.value; o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    select.appendChild(o);
  });
  return select;
}

function openSessionForm(state, existing, defaults = {}) {
  if (!state.subjects.length) { showToast('Add a subject first, from the Subjects tab'); return; }

  const titleInput = textInput(existing?.title || '', 'e.g. Algebra practice');
  const subjectSelect = selectInput(
    state.subjects.map((s) => ({ value: s.id, label: s.name })),
    existing?.subjectId || defaults.subjectId || state.subjects[0].id,
  );
  const typeSelect = selectInput(Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })), existing?.type || 'school');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = existing?.date || defaults.dateKey || viewState.selectedDate;
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = existing?.startTime || '09:00';
  const durationInput = document.createElement('input');
  durationInput.type = 'number'; durationInput.min = '5'; durationInput.step = '5';
  durationInput.value = String(existing?.durationMinutes || 60);
  const roomInput = textInput(existing?.room || '', 'e.g. Room 204');
  const lecturerInput = textInput(existing?.lecturer || '', 'e.g. Priyah Mohan (Ms)');
  const prioritySelect = selectInput([
    { value: '1', label: 'Low' }, { value: '2', label: 'Normal' }, { value: '3', label: 'High' },
  ], String(existing?.priority || 2));

  const repeatToggle = document.createElement('input');
  repeatToggle.type = 'checkbox';
  repeatToggle.checked = !!existing?.recurrence;
  const dayRow = document.createElement('div');
  dayRow.className = 'weekday-picker';
  const selectedDays = new Set(existing?.recurrence?.days || []);
  WEEK_ORDER.forEach((code) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `weekday-btn${selectedDays.has(code) ? ' selected' : ''}`;
    btn.textContent = code[0]; btn.title = code;
    btn.addEventListener('click', () => {
      if (selectedDays.has(code)) selectedDays.delete(code); else selectedDays.add(code);
      btn.classList.toggle('selected');
    });
    dayRow.appendChild(btn);
  });
  const untilInput = document.createElement('input');
  untilInput.type = 'date';
  untilInput.value = existing?.recurrence?.until || '';
  dayRow.appendChild(untilInput);
  const toggleRecurrenceUI = () => { dayRow.style.display = repeatToggle.checked ? 'flex' : 'none'; };
  toggleRecurrenceUI();
  repeatToggle.addEventListener('change', toggleRecurrenceUI);

  const body = document.createElement('div');
  body.appendChild(field('Title', titleInput));
  body.appendChild(field('Subject', subjectSelect));
  body.appendChild(field('Type', typeSelect));
  body.appendChild(field('Date', dateInput));
  body.appendChild(field('Start time', timeInput));
  body.appendChild(field('Duration (minutes)', durationInput));
  body.appendChild(field('Room / location (optional)', roomInput));
  body.appendChild(field('Lecturer (optional)', lecturerInput));
  body.appendChild(field('Priority', prioritySelect));
  const repeatLabel = field('Repeat weekly', repeatToggle);
  repeatLabel.classList.add('form-field-inline');
  body.appendChild(repeatLabel);
  body.appendChild(dayRow);

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save' : 'Add class',
      variant: 'primary',
      onClick: (close) => {
        const title = titleInput.value.trim();
        if (!title) { showToast('Enter a title'); return; }
        const recurrence = repeatToggle.checked && selectedDays.size
          ? { days: [...selectedDays], until: untilInput.value || null }
          : null;
        const payload = {
          title,
          subjectId: subjectSelect.value,
          type: typeSelect.value,
          date: dateInput.value,
          startTime: timeInput.value,
          durationMinutes: Number(durationInput.value) || 30,
          priority: Number(prioritySelect.value),
          recurrence,
          room: roomInput.value.trim(),
          lecturer: lecturerInput.value.trim(),
        };
        mutate((s) => {
          if (existing) Object.assign(s.sessions.find((x) => x.id === existing.id), payload);
          else s.sessions.push(createSession(payload));
        });
        close();
        showToast(existing ? 'Class updated' : 'Class added');
      },
    },
  ];
  if (existing) {
    actions.splice(1, 0, {
      label: 'Delete',
      variant: 'danger',
      onClick: async (close) => {
        close();
        const ok = await confirmModal({ message: `Delete "${existing.title}"?` });
        if (!ok) return;
        mutate((s) => { s.sessions = s.sessions.filter((x) => x.id !== existing.id); });
        showToast('Class deleted');
      },
    });
  }

  openModal({ title: existing ? 'Edit class' : 'Add class', bodyNode: body, actions });
}

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

export function render(container, { state, navigate }) {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(viewState.weekStart, i));
  const agenda = buildAgenda(state, viewState.selectedDate);
  const today = todayKey();

  container.innerHTML = `
    <section class="dash-section timetable-week">
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
      </div>
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
  delegate(container, 'click', '[data-action="go-today"]', () => {
    viewState.weekStart = mondayOf(today);
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
  });
}
