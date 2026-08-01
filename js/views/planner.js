import { todayKey, WEEK_ORDER, formatDayLabel } from '../core/dates.js';
import { mutate } from '../core/store.js';
import {
  createSubject, createTopic, createSession, createExam, SUBJECT_COLORS,
} from '../core/models.js';
import { getSessionsForDate, toggleCompletion } from '../services/scheduler.js';
import { masteryLabel } from '../services/spacedRepetition.js';
import { escapeHtml, delegate } from '../components/dom.js';
import { openModal, closeModal, confirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { iconMarkup } from '../components/icons.js';

const TYPE_LABEL = { school: 'School', study: 'Study', 'exam-prep': 'Exam prep' };
const TYPE_ICON = { school: 'graduation-cap', study: 'book', 'exam-prep': 'file-text' };
const MASTERY_LABEL = { new: 'New', learning: 'Learning', mastered: 'Mastered' };

const viewState = { subjectId: null, dateKey: todayKey() };

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
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

function selectInput(options, value) {
  const select = document.createElement('select');
  options.forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    select.appendChild(o);
  });
  return select;
}

function openSubjectForm(state, existing) {
  const nameInput = textInput(existing?.name || '', 'e.g. Physics');
  const prioritySelect = selectInput([
    { value: '1', label: 'Low priority' }, { value: '2', label: 'Normal priority' }, { value: '3', label: 'High priority' },
  ], String(existing?.priority || 2));

  const colorRow = document.createElement('div');
  colorRow.className = 'color-picker';
  let chosenColor = existing?.color || SUBJECT_COLORS[0];
  SUBJECT_COLORS.forEach((c) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `color-dot${c === chosenColor ? ' selected' : ''}`;
    dot.style.background = c;
    dot.addEventListener('click', () => {
      chosenColor = c;
      colorRow.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    colorRow.appendChild(dot);
  });

  const body = document.createElement('div');
  body.appendChild(field('Subject name', nameInput));
  body.appendChild(field('Priority', prioritySelect));
  body.appendChild(field('Color', colorRow));

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save' : 'Add subject',
      variant: 'primary',
      onClick: (close) => {
        const name = nameInput.value.trim();
        if (!name) { showToast('Enter a subject name'); return; }
        mutate((s) => {
          if (existing) {
            const subj = s.subjects.find((x) => x.id === existing.id);
            Object.assign(subj, { name, priority: Number(prioritySelect.value), color: chosenColor });
          } else {
            s.subjects.push(createSubject({ name, priority: Number(prioritySelect.value), color: chosenColor }));
          }
        });
        close();
        showToast(existing ? 'Subject updated' : 'Subject added');
      },
    },
  ];
  if (existing) {
    actions.splice(1, 0, {
      label: 'Delete',
      variant: 'danger',
      onClick: async (close) => {
        close();
        const ok = await confirmModal({ message: `Delete "${existing.name}" and all its topics, sessions, notes, and flashcards?` });
        if (!ok) return;
        mutate((s) => {
          s.subjects = s.subjects.filter((x) => x.id !== existing.id);
          s.topics = s.topics.filter((x) => x.subjectId !== existing.id);
          s.sessions = s.sessions.filter((x) => x.subjectId !== existing.id);
          s.notes = s.notes.filter((x) => x.subjectId !== existing.id);
          s.flashcards = s.flashcards.filter((x) => x.subjectId !== existing.id);
          s.quizzes = s.quizzes.filter((x) => x.subjectId !== existing.id);
          s.exams = s.exams.filter((x) => x.subjectId !== existing.id);
        });
        if (viewState.subjectId === existing.id) viewState.subjectId = null;
        showToast('Subject deleted');
      },
    });
  }

  openModal({ title: existing ? 'Edit subject' : 'New subject', bodyNode: body, actions });
}

function openSessionForm(state, existing, defaults = {}) {
  if (!state.subjects.length) { showToast('Add a subject first'); return; }

  const titleInput = textInput(existing?.title || '', 'e.g. Algebra practice');
  const subjectSelect = selectInput(
    state.subjects.map((s) => ({ value: s.id, label: s.name })),
    existing?.subjectId || defaults.subjectId || state.subjects[0].id,
  );
  const typeSelect = selectInput(
    Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    existing?.type || 'study',
  );
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = existing?.date || defaults.dateKey || viewState.dateKey;

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = existing?.startTime || '16:00';

  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.min = '5';
  durationInput.step = '5';
  durationInput.value = String(existing?.durationMinutes || 30);

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
    btn.textContent = code[0];
    btn.title = code;
    btn.addEventListener('click', () => {
      if (selectedDays.has(code)) selectedDays.delete(code); else selectedDays.add(code);
      btn.classList.toggle('selected');
    });
    dayRow.appendChild(btn);
  });
  dayRow.style.display = repeatToggle.checked ? 'flex' : 'none';
  repeatToggle.addEventListener('change', () => { dayRow.style.display = repeatToggle.checked ? 'flex' : 'none'; });

  const body = document.createElement('div');
  body.appendChild(field('Title', titleInput));
  body.appendChild(field('Subject', subjectSelect));
  body.appendChild(field('Type', typeSelect));
  body.appendChild(field('Date', dateInput));
  body.appendChild(field('Start time', timeInput));
  body.appendChild(field('Duration (minutes)', durationInput));
  body.appendChild(field('Priority', prioritySelect));
  const repeatLabel = field('Repeat weekly', repeatToggle);
  repeatLabel.classList.add('form-field-inline');
  body.appendChild(repeatLabel);
  body.appendChild(dayRow);

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save' : 'Add session',
      variant: 'primary',
      onClick: (close) => {
        const title = titleInput.value.trim();
        if (!title) { showToast('Enter a title'); return; }
        const recurrence = repeatToggle.checked && selectedDays.size
          ? { days: [...selectedDays], until: null }
          : null;

        mutate((s) => {
          if (existing) {
            const session = s.sessions.find((x) => x.id === existing.id);
            Object.assign(session, {
              title,
              subjectId: subjectSelect.value,
              type: typeSelect.value,
              date: dateInput.value,
              startTime: timeInput.value,
              durationMinutes: Number(durationInput.value) || 30,
              priority: Number(prioritySelect.value),
              recurrence,
            });
          } else {
            s.sessions.push(createSession({
              title,
              subjectId: subjectSelect.value,
              type: typeSelect.value,
              date: dateInput.value,
              startTime: timeInput.value,
              durationMinutes: Number(durationInput.value) || 30,
              priority: Number(prioritySelect.value),
              recurrence,
            }));
          }
        });
        close();
        showToast(existing ? 'Session updated' : 'Session scheduled');
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
        showToast('Session deleted');
      },
    });
  }

  openModal({ title: existing ? 'Edit session' : 'Add session', bodyNode: body, actions });
}

function openTopicForm(state, subjectId, existing) {
  const nameInput = textInput(existing?.name || '', 'e.g. Newton\'s Laws');
  const difficultySelect = selectInput([
    { value: '1', label: 'Easy' }, { value: '2', label: 'Medium' }, { value: '3', label: 'Hard' },
  ], String(existing?.difficulty || 2));

  const body = document.createElement('div');
  body.appendChild(field('Topic name', nameInput));
  body.appendChild(field('Difficulty', difficultySelect));

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save' : 'Add topic',
      variant: 'primary',
      onClick: (close) => {
        const name = nameInput.value.trim();
        if (!name) { showToast('Enter a topic name'); return; }
        mutate((s) => {
          if (existing) {
            Object.assign(s.topics.find((t) => t.id === existing.id), { name, difficulty: Number(difficultySelect.value) });
          } else {
            s.topics.push(createTopic({ subjectId, name, difficulty: Number(difficultySelect.value) }));
          }
        });
        close();
      },
    },
  ];
  if (existing) {
    actions.splice(1, 0, {
      label: 'Delete',
      variant: 'danger',
      onClick: async (close) => {
        close();
        const ok = await confirmModal({ message: `Delete topic "${existing.name}"?` });
        if (!ok) return;
        mutate((s) => { s.topics = s.topics.filter((t) => t.id !== existing.id); });
      },
    });
  }

  openModal({ title: existing ? 'Edit topic' : 'New topic', bodyNode: body, actions });
}

function openExamForm(state, subjectId) {
  const nameInput = textInput('', 'e.g. Mid-term exam');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = todayKey();

  const body = document.createElement('div');
  body.appendChild(field('Exam name', nameInput));
  body.appendChild(field('Date', dateInput));

  openModal({
    title: 'New exam',
    bodyNode: body,
    actions: [
      { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
      {
        label: 'Add exam',
        variant: 'primary',
        onClick: (close) => {
          const name = nameInput.value.trim();
          if (!name) { showToast('Enter an exam name'); return; }
          mutate((s) => s.exams.push(createExam({ subjectId, name, date: dateInput.value })));
          close();
          showToast('Exam added');
        },
      },
    ],
  });
}

export function render(container, { state, params }) {
  if (params?.subjectId) { viewState.subjectId = params.subjectId; }
  if (!state.subjects.some((s) => s.id === viewState.subjectId)) viewState.subjectId = null;

  const dayEntries = getSessionsForDate(state, viewState.dateKey)
    .filter((e) => !viewState.subjectId || e.session.subjectId === viewState.subjectId);

  const topics = viewState.subjectId ? state.topics.filter((t) => t.subjectId === viewState.subjectId) : [];
  const exams = viewState.subjectId ? state.exams.filter((e) => e.subjectId === viewState.subjectId) : [];

  container.innerHTML = `
    <section class="planner-subjects">
      <div class="section-header"><h2>Subjects</h2><button class="btn-chip" data-action="add-subject">+ New</button></div>
      <div class="subject-chip-row">
        <button class="subject-chip${!viewState.subjectId ? ' selected' : ''}" data-select-subject="">All</button>
        ${state.subjects.map((s) => `
          <button class="subject-chip${viewState.subjectId === s.id ? ' selected' : ''}" data-select-subject="${s.id}" style="--chip-color:${s.color}">
            <span class="chip-dot"></span>${escapeHtml(s.name)}
          </button>
        `).join('')}
      </div>
      ${state.subjects.length && viewState.subjectId ? `<button class="link-btn" data-action="edit-subject">${iconMarkup('edit', { size: 13 })}Edit ${escapeHtml(state.subjects.find((s) => s.id === viewState.subjectId)?.name || '')}</button>` : ''}
      ${!state.subjects.length ? '<p class="empty-state-inline">Create your first subject to start planning.</p>' : ''}
    </section>

    <section class="planner-days">
      <div class="day-indicator"></div>
    </section>

    <section class="planner-sessions">
      <div class="section-header"><h2>Sessions · <input type="date" id="plannerDate" value="${viewState.dateKey}"></h2><button class="btn-chip" data-action="add-session">+ Add</button></div>
      ${dayEntries.length ? `
        <div class="session-list">
          ${dayEntries.map(({ session, completed }) => `
            <div class="session-row editable${completed ? ' completed' : ''}">
              <input type="checkbox" data-toggle-session="${session.id}" ${completed ? 'checked' : ''}>
              <span class="session-icon">${iconMarkup(TYPE_ICON[session.type] || 'book', { size: 15 })}</span>
              <span class="session-info" data-edit-session="${session.id}">
                <span class="session-title">${escapeHtml(session.title)}${session.recurrence ? ` ${iconMarkup('repeat', { size: 11 })}` : ''}</span>
                <span class="session-meta">${TYPE_LABEL[session.type]} · ${session.startTime} · ${session.durationMinutes}m</span>
              </span>
            </div>
          `).join('')}
        </div>
      ` : '<p class="empty-state-inline">No sessions this day.</p>'}
    </section>

    ${viewState.subjectId ? `
    <section class="planner-topics">
      <div class="section-header"><h2>Topics</h2><button class="btn-chip" data-action="add-topic">+ Add</button></div>
      ${topics.length ? `
        <div class="topic-list">
          ${topics.map((t) => `
            <button class="topic-row" data-edit-topic="${t.id}">
              <span>${escapeHtml(t.name)}</span>
              <span class="badge badge-${masteryLabel(t.srs)}">${MASTERY_LABEL[masteryLabel(t.srs)]}</span>
            </button>
          `).join('')}
        </div>
      ` : '<p class="empty-state-inline">No topics yet.</p>'}
    </section>

    <section class="planner-exams">
      <div class="section-header"><h2>Exams</h2><button class="btn-chip" data-action="add-exam">+ Add</button></div>
      ${exams.length ? `
        <div class="exam-list">
          ${exams.map((e) => `<div class="exam-row"><span>${escapeHtml(e.name)}</span><span>${e.date}</span></div>`).join('')}
        </div>
      ` : '<p class="empty-state-inline">No exams scheduled.</p>'}
    </section>` : ''}
  `;

  const dayIndicator = container.querySelector('.planner-days .day-indicator');
  dayIndicator.innerHTML = Array.from({ length: 14 }).map((_, i) => {
    const offset = i - 3;
    const d = new Date(); d.setDate(d.getDate() + offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `<button class="day-chip${key === viewState.dateKey ? ' active-day' : ''}${key === todayKey() ? ' today-chip' : ''}" data-select-date="${key}">${formatDayLabel(key).split(',')[0]}</button>`;
  }).join('');

  delegate(container, 'click', '[data-select-subject]', (e, t) => {
    viewState.subjectId = t.dataset.selectSubject || null;
    render(container, { state, params: {} });
  });
  delegate(container, 'click', '[data-select-date]', (e, t) => {
    viewState.dateKey = t.dataset.selectDate;
    render(container, { state, params: {} });
  });
  container.querySelector('#plannerDate')?.addEventListener('change', (e) => {
    viewState.dateKey = e.target.value;
    render(container, { state, params: {} });
  });

  delegate(container, 'click', '[data-action="add-subject"]', () => openSubjectForm(state, null));
  delegate(container, 'click', '[data-action="edit-subject"]', () => openSubjectForm(state, state.subjects.find((s) => s.id === viewState.subjectId)));
  delegate(container, 'click', '[data-action="add-session"]', () => openSessionForm(state, null, { subjectId: viewState.subjectId, dateKey: viewState.dateKey }));
  delegate(container, 'click', '[data-edit-session]', (e, t) => openSessionForm(state, state.sessions.find((s) => s.id === t.dataset.editSession)));
  delegate(container, 'click', '[data-action="add-topic"]', () => openTopicForm(state, viewState.subjectId, null));
  delegate(container, 'click', '[data-edit-topic]', (e, t) => openTopicForm(state, viewState.subjectId, state.topics.find((x) => x.id === t.dataset.editTopic)));
  delegate(container, 'click', '[data-action="add-exam"]', () => openExamForm(state, viewState.subjectId));

  delegate(container, 'change', '[data-toggle-session]', (e, t) => {
    mutate((s) => {
      const session = s.sessions.find((x) => x.id === t.dataset.toggleSession);
      if (session) toggleCompletion(session, viewState.dateKey);
    });
  });
}
