import { WEEK_ORDER, todayKey } from '../core/dates.js';
import { mutate } from '../core/store.js';
import { createSession } from '../core/models.js';
import { openModal, confirmModal } from './modal.js';
import { showToast } from './toast.js';

const TYPE_LABEL = { school: 'School', study: 'Study', 'exam-prep': 'Exam prep' };

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

// The single "add/edit class" form used everywhere a class can be created
// or edited (Timetable, Subject Workspace) — including a subject select in
// every case, so a class created or edited from any entry point can always
// be reassigned, not just the ones that happened to remember to ask.
export function openSessionForm(state, existing, defaults = {}) {
  if (!state.subjects.length) { showToast('Add a subject first, from the Subjects tab'); return; }

  const titleInput = textInput(existing?.title || '', 'e.g. Algebra practice');
  const subjectSelect = selectInput(
    state.subjects.map((s) => ({ value: s.id, label: s.name })),
    existing?.subjectId || defaults.subjectId || state.subjects[0].id,
  );
  const typeSelect = selectInput(Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })), existing?.type || 'school');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = existing?.date || defaults.dateKey || todayKey();
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
  // Defaults to the semester's end date, when one's set — the term is the
  // master data for "when does this stop repeating," so a new recurring
  // class doesn't make the student re-supply a date the app already knows.
  untilInput.value = existing?.recurrence?.until || state.term?.endDate || '';
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
