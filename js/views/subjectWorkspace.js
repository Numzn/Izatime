import {
  todayKey, WEEK_ORDER, diffInDays, addDays, minutesFromHHMM, nowHHMM,
} from '../core/dates.js';
import { mutate } from '../core/store.js';
import {
  createSubject, createSession, createAssignment, createAssessment, createNote, createFlashcard,
  SUBJECT_COLORS, ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES,
} from '../core/models.js';
import { getSessionsForDate, toggleCompletion } from '../services/scheduler.js';
import { masteryLabel, review, getDueFlashcards } from '../services/spacedRepetition.js';
import {
  getAssignmentsForSubject, getAssessmentsForSubject, isAssignmentDone, computeAssignmentPriority,
} from '../services/assignments.js';
import { getSubjectPerformance } from '../services/analytics.js';
import { generateQuiz } from '../services/aiCoach.js';
import { escapeHtml, delegate, clear } from '../components/dom.js';
import { openModal, confirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { iconMarkup } from '../components/icons.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'classes', label: 'Classes', icon: 'calendar' },
  { id: 'assignments', label: 'Assignments', icon: 'edit' },
  { id: 'assessments', label: 'Assessments', icon: 'help-circle' },
  { id: 'notes', label: 'Notes', icon: 'notebook' },
  { id: 'flashcards', label: 'Cards', icon: 'layers' },
  { id: 'history', label: 'History', icon: 'trending-up' },
];

const TYPE_LABEL = { school: 'School', study: 'Study', 'exam-prep': 'Exam prep' };
const TYPE_ICON = { school: 'graduation-cap', study: 'book', 'exam-prep': 'file-text' };
const MASTERY_LABEL = { new: 'New', learning: 'Learning', mastered: 'Mastered' };
const ASSIGNMENT_TYPE_LABEL = {
  homework: 'Homework', project: 'Project', essay: 'Essay', lab: 'Lab', reading: 'Reading', other: 'Other',
};
const ASSIGNMENT_STATUS_LABEL = {
  'not-started': 'Not started', 'in-progress': 'In progress', submitted: 'Submitted', graded: 'Graded',
};
const ASSESSMENT_KIND_LABEL = {
  quiz: 'Quiz', test: 'Test', exam: 'Exam', practical: 'Practical',
};

const viewState = { subjectId: null, tab: 'overview' };

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

function numberInput(value = '', placeholder = '') {
  const i = document.createElement('input');
  i.type = 'number'; i.value = value; i.placeholder = placeholder; i.min = '0';
  return i;
}

function textArea(value = '', placeholder = '') {
  const t = document.createElement('textarea');
  t.value = value; t.placeholder = placeholder; t.rows = 4;
  return t;
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

function nextClassForSubject(state, subjectId, fromDateKey) {
  const fromMinutes = fromDateKey === todayKey() ? minutesFromHHMM(nowHHMM()) : -1;
  for (let offset = 0; offset < 14; offset += 1) {
    const dateKey = addDays(fromDateKey, offset);
    const entries = getSessionsForDate(state, dateKey).filter((entry) => (
      entry.session.subjectId === subjectId
      && !entry.completed
      && (offset > 0 || minutesFromHHMM(entry.session.startTime) >= fromMinutes)
    ));
    if (entries.length) return { ...entries[0], dateKey };
  }
  return null;
}

// ---- Subject form ----
function openSubjectForm(existing) {
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
        let newId = null;
        mutate((s) => {
          if (existing) {
            Object.assign(s.subjects.find((x) => x.id === existing.id), { name, priority: Number(prioritySelect.value), color: chosenColor });
          } else {
            const created = createSubject({ name, priority: Number(prioritySelect.value), color: chosenColor });
            s.subjects.push(created);
            newId = created.id;
          }
        });
        if (newId) viewState.subjectId = newId;
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
        const ok = await confirmModal({ message: `Delete "${existing.name}" and everything in it — classes, assignments, assessments, notes, and flashcards?` });
        if (!ok) return;
        mutate((s) => {
          s.subjects = s.subjects.filter((x) => x.id !== existing.id);
          s.topics = s.topics.filter((x) => x.subjectId !== existing.id);
          s.sessions = s.sessions.filter((x) => x.subjectId !== existing.id);
          s.notes = s.notes.filter((x) => x.subjectId !== existing.id);
          s.flashcards = s.flashcards.filter((x) => x.subjectId !== existing.id);
          s.quizzes = s.quizzes.filter((x) => x.subjectId !== existing.id);
          s.assessments = s.assessments.filter((x) => x.subjectId !== existing.id);
          s.assignments = s.assignments.filter((x) => x.subjectId !== existing.id);
        });
        if (viewState.subjectId === existing.id) viewState.subjectId = null;
        showToast('Subject deleted');
      },
    });
  }

  openModal({ title: existing ? 'Edit subject' : 'New subject', bodyNode: body, actions });
}

// ---- Class (session) form ----
function openSessionForm(subjectId, existing) {
  const titleInput = textInput(existing?.title || '', 'e.g. Algebra practice');
  const typeSelect = selectInput(
    Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    existing?.type || 'school',
  );
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = existing?.date || todayKey();

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = existing?.startTime || '09:00';

  const durationInput = numberInput(String(existing?.durationMinutes || 60));
  durationInput.step = '5';

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
    btn.textContent = code[0];
    btn.title = code;
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
          subjectId,
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

// ---- Assignment form ----
function openAssignmentForm(subjectId, existing) {
  const titleInput = textInput(existing?.title || '', 'e.g. Lab report 3');
  const dueDateInput = document.createElement('input');
  dueDateInput.type = 'date';
  dueDateInput.value = existing?.dueDate || todayKey();
  const dueTimeInput = document.createElement('input');
  dueTimeInput.type = 'time';
  dueTimeInput.value = existing?.dueTime || '';
  const typeSelect = selectInput(ASSIGNMENT_TYPES.map((t) => ({ value: t, label: ASSIGNMENT_TYPE_LABEL[t] })), existing?.type || 'homework');
  const estInput = numberInput(existing?.estimatedMinutes ?? '', 'e.g. 90');
  const weightInput = numberInput(existing?.weight ?? '', 'e.g. 20');
  const descInput = textArea(existing?.description || '', 'Details (optional)');
  const priorityOverrideSelect = selectInput([
    { value: '', label: 'Auto' }, { value: '1', label: 'Low' }, { value: '2', label: 'Normal' }, { value: '3', label: 'High' },
  ], existing?.priorityOverride ? String(existing.priorityOverride) : '');

  const body = document.createElement('div');
  body.appendChild(field('Title', titleInput));
  body.appendChild(field('Due date', dueDateInput));
  body.appendChild(field('Due time (optional)', dueTimeInput));
  body.appendChild(field('Type', typeSelect));
  body.appendChild(field('Estimated effort (minutes)', estInput));
  body.appendChild(field('Weight (% of grade, optional)', weightInput));
  body.appendChild(field('Priority', priorityOverrideSelect));
  body.appendChild(field('Description', descInput));

  let statusSelect = null;
  if (existing) {
    statusSelect = selectInput(ASSIGNMENT_STATUSES.map((st) => ({ value: st, label: ASSIGNMENT_STATUS_LABEL[st] })), existing.status);
    body.appendChild(field('Status', statusSelect));
  }

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save' : 'Add assignment',
      variant: 'primary',
      onClick: (close) => {
        const title = titleInput.value.trim();
        if (!title) { showToast('Enter a title'); return; }
        const payload = {
          title,
          subjectId,
          dueDate: dueDateInput.value,
          dueTime: dueTimeInput.value || null,
          type: typeSelect.value,
          estimatedMinutes: estInput.value ? Number(estInput.value) : null,
          weight: weightInput.value ? Number(weightInput.value) : null,
          priorityOverride: priorityOverrideSelect.value ? Number(priorityOverrideSelect.value) : null,
          description: descInput.value.trim(),
        };
        mutate((s) => {
          if (existing) {
            Object.assign(s.assignments.find((x) => x.id === existing.id), payload, { status: statusSelect.value });
          } else {
            s.assignments.push(createAssignment(payload));
          }
        });
        close();
        showToast(existing ? 'Assignment updated' : 'Assignment added');
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
        mutate((s) => { s.assignments = s.assignments.filter((x) => x.id !== existing.id); });
        showToast('Assignment deleted');
      },
    });
  }

  openModal({ title: existing ? 'Edit assignment' : 'Add assignment', bodyNode: body, actions });
}

// ---- Assessment form ----
function openAssessmentForm(subjectId, existing) {
  const nameInput = textInput(existing?.name || '', 'e.g. Mid-term exam');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = existing?.date || todayKey();
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = existing?.startTime || '';
  const kindSelect = selectInput(Object.entries(ASSESSMENT_KIND_LABEL).map(([value, label]) => ({ value, label })), existing?.kind || 'exam');
  const weightInput = numberInput(existing?.weight ?? '', 'e.g. 30');

  const body = document.createElement('div');
  body.appendChild(field('Name', nameInput));
  body.appendChild(field('Kind', kindSelect));
  body.appendChild(field('Date', dateInput));
  body.appendChild(field('Start time (optional)', timeInput));
  body.appendChild(field('Weight (% of grade, optional)', weightInput));

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save' : 'Add assessment',
      variant: 'primary',
      onClick: (close) => {
        const name = nameInput.value.trim();
        if (!name) { showToast('Enter a name'); return; }
        const payload = {
          subjectId,
          name,
          date: dateInput.value,
          startTime: timeInput.value || null,
          kind: kindSelect.value,
          weight: weightInput.value ? Number(weightInput.value) : null,
        };
        mutate((s) => {
          if (existing) Object.assign(s.assessments.find((x) => x.id === existing.id), payload);
          else s.assessments.push(createAssessment(payload));
        });
        close();
        showToast(existing ? 'Assessment updated' : 'Assessment added');
      },
    },
  ];
  if (existing) {
    actions.splice(1, 0, {
      label: 'Delete',
      variant: 'danger',
      onClick: async (close) => {
        close();
        const ok = await confirmModal({ message: `Delete "${existing.name}"?` });
        if (!ok) return;
        mutate((s) => { s.assessments = s.assessments.filter((x) => x.id !== existing.id); });
        showToast('Assessment deleted');
      },
    });
  }

  openModal({ title: existing ? 'Edit assessment' : 'Add assessment', bodyNode: body, actions });
}

// ---- Notes / flashcards / quiz (ported, subject-scoped) ----
function openNoteForm(subjectId, existing) {
  const titleInput = textInput(existing?.title || '', 'Title');
  const bodyInput = textArea(existing?.body || '', 'Write your notes here...');
  const body = document.createElement('div');
  body.appendChild(field('Title', titleInput));
  body.appendChild(field('Notes', bodyInput));

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (c) => c() },
    {
      label: 'Save',
      variant: 'primary',
      onClick: (close) => {
        const title = titleInput.value.trim();
        if (!title) { showToast('Enter a title'); return; }
        mutate((s) => {
          if (existing) {
            Object.assign(s.notes.find((n) => n.id === existing.id), { title, body: bodyInput.value, updatedAt: new Date().toISOString() });
          } else {
            s.notes.push(createNote({ subjectId, title, body: bodyInput.value }));
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
        if (!(await confirmModal({ message: `Delete note "${existing.title}"?` }))) return;
        mutate((s) => { s.notes = s.notes.filter((n) => n.id !== existing.id); });
      },
    });
  }
  openModal({ title: existing ? 'Edit note' : 'New note', bodyNode: body, actions });
}

function openFlashcardForm(subjectId, existing) {
  const frontInput = textArea(existing?.front || '', 'Question / prompt');
  const backInput = textArea(existing?.back || '', 'Answer');
  const body = document.createElement('div');
  body.appendChild(field('Front', frontInput));
  body.appendChild(field('Back', backInput));

  const actions = [
    { label: 'Cancel', variant: 'ghost', onClick: (c) => c() },
    {
      label: 'Save',
      variant: 'primary',
      onClick: (close) => {
        const front = frontInput.value.trim();
        const back = backInput.value.trim();
        if (!front || !back) { showToast('Fill in both sides'); return; }
        mutate((s) => {
          if (existing) Object.assign(s.flashcards.find((c) => c.id === existing.id), { front, back });
          else s.flashcards.push(createFlashcard({ subjectId, front, back }));
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
        if (!(await confirmModal({ message: 'Delete this flashcard?' }))) return;
        mutate((s) => { s.flashcards = s.flashcards.filter((c) => c.id !== existing.id); });
      },
    });
  }
  openModal({ title: existing ? 'Edit flashcard' : 'New flashcard', bodyNode: body, actions });
}

function openReviewSession(state, subjectId) {
  const queue = getDueFlashcards(state).filter((c) => c.subjectId === subjectId);
  if (!queue.length) { showToast('No cards due for review'); return; }

  let index = 0;
  let showingBack = false;
  const body = document.createElement('div');
  body.className = 'review-body';

  function draw() {
    const card = queue[index];
    body.innerHTML = `
      <p class="review-progress">${index + 1} / ${queue.length}</p>
      <div class="flashcard ${showingBack ? 'flipped' : ''}">${escapeHtml(showingBack ? card.back : card.front)}</div>
    `;
    body.querySelector('.flashcard').addEventListener('click', () => { showingBack = !showingBack; draw(); });
  }
  draw();

  const ratingRow = document.createElement('div');
  ratingRow.className = 'rating-row';
  ['again', 'hard', 'good', 'easy'].forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn rating-btn rating-${key}`;
    btn.textContent = key[0].toUpperCase() + key.slice(1);
    btn.addEventListener('click', () => {
      mutate((s) => {
        const card = s.flashcards.find((c) => c.id === queue[index].id);
        if (card) review(card.srs, key);
      });
      index += 1;
      showingBack = false;
      if (index >= queue.length) { close(); showToast('Review complete'); } else draw();
    });
    ratingRow.appendChild(btn);
  });
  body.appendChild(ratingRow);

  const close = openModal({ title: 'Review', bodyNode: body, actions: [] });
}

function openQuizModal(quiz) {
  const answers = new Array(quiz.questions.length).fill(null);
  let submitted = false;
  const body = document.createElement('div');
  body.className = 'quiz-body';

  function draw() {
    clear(body);
    quiz.questions.forEach((q, qi) => {
      const block = document.createElement('div');
      block.className = 'quiz-question';
      const p = document.createElement('p');
      p.className = 'quiz-question-text';
      p.textContent = `${qi + 1}. ${q.question}`;
      block.appendChild(p);
      q.options.forEach((opt, oi) => {
        const optLabel = document.createElement('label');
        optLabel.className = 'quiz-option';
        if (submitted) {
          if (oi === q.answerIndex) optLabel.classList.add('correct');
          else if (oi === answers[qi]) optLabel.classList.add('incorrect');
        }
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = `q${qi}`; radio.disabled = submitted; radio.checked = answers[qi] === oi;
        radio.addEventListener('change', () => { answers[qi] = oi; });
        optLabel.appendChild(radio);
        optLabel.appendChild(document.createTextNode(opt));
        block.appendChild(optLabel);
      });
      body.appendChild(block);
    });
    if (submitted) {
      const score = answers.filter((a, i) => a === quiz.questions[i].answerIndex).length;
      const result = document.createElement('p');
      result.className = 'quiz-result';
      result.textContent = `Score: ${score} / ${quiz.questions.length}`;
      body.appendChild(result);
    }
  }
  draw();

  openModal({
    title: quiz.title,
    bodyNode: body,
    actions: [
      { label: 'Close', variant: 'ghost', onClick: (c) => c() },
      {
        label: 'Submit',
        variant: 'primary',
        onClick: () => {
          if (submitted) return;
          if (answers.some((a) => a === null)) { showToast('Answer every question first'); return; }
          submitted = true;
          const score = answers.filter((a, i) => a === quiz.questions[i].answerIndex).length;
          mutate((s) => { s.quizzes.find((x) => x.id === quiz.id).attempts.push({ date: todayKey(), score, total: quiz.questions.length }); });
          draw();
        },
      },
    ],
  });
}

// ---- Tab content renderers ----
function renderOverview(state, subject) {
  const dateKey = todayKey();
  const next = nextClassForSubject(state, subject.id, dateKey);
  const dueAssignments = getAssignmentsForSubject(state, subject.id)
    .filter((a) => !isAssignmentDone(a) && diffInDays(dateKey, a.dueDate) >= -1)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);
  const upcomingAssessments = getAssessmentsForSubject(state, subject.id)
    .filter((a) => diffInDays(dateKey, a.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  return `
    <div class="section-header"><h2>Overview</h2><button class="btn btn-primary btn-sm" data-action="prepare-now">${iconMarkup('timer', { size: 14 })}Prepare now</button></div>
    ${next ? `
      <div class="overview-next">
        <span class="overview-label">Next class</span>
        <span class="overview-title">${escapeHtml(next.session.title)} · ${next.dateKey === dateKey ? next.session.startTime : next.dateKey}</span>
      </div>
    ` : '<p class="empty-state-inline">No upcoming classes for this subject.</p>'}

    ${dueAssignments.length ? `
      <h3 class="overview-subhead">Assignments</h3>
      <div class="due-list">
        ${dueAssignments.map((a) => {
          const daysLeft = diffInDays(dateKey, a.dueDate);
          return `<button class="due-row" data-open-assignment="${a.id}">
            <span class="due-chip due-chip-assignment">${ASSIGNMENT_STATUS_LABEL[a.status]}</span>
            <span class="due-title">${escapeHtml(a.title)}</span>
            <span class="due-when">${daysLeft <= 0 ? 'Due today' : `${daysLeft}d`}</span>
          </button>`;
        }).join('')}
      </div>` : ''}

    ${upcomingAssessments.length ? `
      <h3 class="overview-subhead">Assessments</h3>
      <div class="due-list">
        ${upcomingAssessments.map((a) => `<button class="due-row" data-open-assessment="${a.id}">
          <span class="due-chip due-chip-assessment">${ASSESSMENT_KIND_LABEL[a.kind]}</span>
          <span class="due-title">${escapeHtml(a.name)}</span>
          <span class="due-when">${a.date}</span>
        </button>`).join('')}
      </div>` : ''}
  `;
}

function renderClasses(state, subject) {
  const sessions = state.sessions.filter((s) => s.subjectId === subject.id);
  return `
    <div class="section-header"><h2>Classes</h2><button class="btn-chip" data-action="add-class">+ Add</button></div>
    ${sessions.length ? `<div class="session-list">${sessions.map((session) => `
      <div class="session-row editable">
        <span class="session-icon">${iconMarkup(TYPE_ICON[session.type] || 'book', { size: 15 })}</span>
        <span class="session-info" data-edit-class="${session.id}">
          <span class="session-title">${escapeHtml(session.title)}${session.recurrence ? ` ${iconMarkup('repeat', { size: 11 })}` : ''}</span>
          <span class="session-meta">${TYPE_LABEL[session.type]} · ${session.recurrence ? session.recurrence.days.join('/') : session.date} · ${session.startTime}${session.room ? ` · ${escapeHtml(session.room)}` : ''}</span>
        </span>
      </div>
    `).join('')}</div>` : '<p class="empty-state-inline">No classes yet.</p>'}
  `;
}

function renderAssignments(state, subject) {
  const assignments = getAssignmentsForSubject(state, subject.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return `
    <div class="section-header"><h2>Assignments</h2><button class="btn-chip" data-action="add-assignment">+ Add</button></div>
    ${assignments.length ? `<div class="assignment-list">${assignments.map((a) => {
      const priority = computeAssignmentPriority(a, subject);
      return `<button class="assignment-row status-${a.status}" data-open-assignment="${a.id}">
        <span class="assignment-main">
          <span class="assignment-title">${escapeHtml(a.title)}</span>
          <span class="assignment-meta">${ASSIGNMENT_TYPE_LABEL[a.type]} · Due ${a.dueDate}${a.weight ? ` · ${a.weight}%` : ''}</span>
        </span>
        <span class="badge badge-priority-${priority}">${ASSIGNMENT_STATUS_LABEL[a.status]}</span>
      </button>`;
    }).join('')}</div>` : '<p class="empty-state-inline">No assignments yet.</p>'}
  `;
}

function renderAssessments(state, subject) {
  const assessments = getAssessmentsForSubject(state, subject.id).sort((a, b) => a.date.localeCompare(b.date));
  return `
    <div class="section-header"><h2>Assessments</h2><button class="btn-chip" data-action="add-assessment">+ Add</button></div>
    ${assessments.length ? `<div class="exam-list">${assessments.map((a) => `
      <button class="exam-row" data-open-assessment="${a.id}">
        <span>${ASSESSMENT_KIND_LABEL[a.kind]} · ${escapeHtml(a.name)}</span>
        <span>${a.date}${a.startTime ? ` ${a.startTime}` : ''}</span>
      </button>
    `).join('')}</div>` : '<p class="empty-state-inline">No assessments scheduled.</p>'}
  `;
}

function renderNotes(state, subject) {
  const notes = state.notes.filter((n) => n.subjectId === subject.id);
  return `
    <div class="section-header"><h2>Notes</h2><button class="btn-chip" data-action="add-note">+ Add</button></div>
    ${notes.length ? `<div class="note-list">${notes.map((n) => `
      <button class="note-card" data-edit-note="${n.id}">
        <span class="note-title">${escapeHtml(n.title)}</span>
        <span class="note-preview">${escapeHtml(n.body.slice(0, 80))}</span>
      </button>`).join('')}</div>` : '<p class="empty-state-inline">No notes yet.</p>'}
  `;
}

function renderFlashcards(state, subject) {
  const cards = state.flashcards.filter((c) => c.subjectId === subject.id);
  const dueCount = getDueFlashcards(state).filter((c) => c.subjectId === subject.id).length;
  const quizzes = state.quizzes.filter((q) => q.subjectId === subject.id);
  return `
    <div class="section-header"><h2>Flashcards</h2><button class="btn-chip" data-action="add-card">+ Add</button></div>
    ${dueCount ? `<button class="btn btn-primary review-cta" data-action="review">Review ${dueCount} due card${dueCount === 1 ? '' : 's'}</button>` : ''}
    ${cards.length ? `<div class="card-list">${cards.map((c) => `
      <button class="card-row" data-edit-card="${c.id}">
        <span>${escapeHtml(c.front.slice(0, 60))}</span>
        <span class="badge badge-${masteryLabel(c.srs)}">${MASTERY_LABEL[masteryLabel(c.srs)]}</span>
      </button>`).join('')}</div>` : '<p class="empty-state-inline">No flashcards yet.</p>'}

    <div class="section-header" style="margin-top:20px"><h2>Quizzes</h2><button class="btn-chip" data-action="generate-quiz">${iconMarkup('spark', { size: 12 })}Generate</button></div>
    ${quizzes.length ? `<div class="quiz-list">${quizzes.slice().reverse().map((q) => {
      const last = q.attempts[q.attempts.length - 1];
      return `<button class="quiz-row" data-open-quiz="${q.id}">
        <span>${escapeHtml(q.title)} · ${q.questions.length}q</span>
        <span>${last ? `${last.score}/${last.total}` : 'Not taken'}</span>
      </button>`;
    }).join('')}</div>` : '<p class="empty-state-inline">Generate a quiz from your flashcards.</p>'}
  `;
}

function renderHistory(state, subject) {
  const perf = getSubjectPerformance(state, 30).find((p) => p.subject.id === subject.id);
  if (!perf) return '<p class="empty-state-inline">Not enough activity yet.</p>';
  return `
    <h2>History</h2>
    <div class="perf-row">
      <div class="perf-header"><span>Completion rate</span><span class="perf-pct">${perf.completionPct === null ? '—' : `${perf.completionPct}%`}</span></div>
      <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${perf.completionPct || 0}%;background:${subject.color}"></div></div>
      <div class="perf-meta">${perf.topicsMastered}/${perf.topicsTotal} topics mastered${perf.avgQuizScore !== null ? ` · Quiz avg ${perf.avgQuizScore}%` : ''}</div>
    </div>
  `;
}

export function render(container, { state, params, navigate }) {
  if (params?.subjectId) { viewState.subjectId = params.subjectId; viewState.tab = 'overview'; }
  if (!state.subjects.some((s) => s.id === viewState.subjectId)) {
    viewState.subjectId = state.subjects[0]?.id || null;
  }

  if (!state.subjects.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Add a subject to get started.</p>
        <button class="btn btn-primary" data-action="add-subject">+ New subject</button>
      </div>`;
    delegate(container, 'click', '[data-action="add-subject"]', () => openSubjectForm(null));
    return;
  }

  const subject = state.subjects.find((s) => s.id === viewState.subjectId);

  const tabContent = {
    overview: renderOverview, classes: renderClasses, assignments: renderAssignments, assessments: renderAssessments, notes: renderNotes, flashcards: renderFlashcards, history: renderHistory,
  }[viewState.tab](state, subject);

  container.innerHTML = `
    <section class="hub-subjects">
      <div class="subject-chip-row">
        ${state.subjects.map((s) => `
          <button class="subject-chip${s.id === subject.id ? ' selected' : ''}" data-select-subject="${s.id}" style="--chip-color:${s.color}">
            <span class="chip-dot"></span>${escapeHtml(s.name)}
          </button>
        `).join('')}
        <button class="subject-chip subject-chip-add" data-action="add-subject">${iconMarkup('plus', { size: 13 })}</button>
      </div>
      <button class="link-btn" data-action="edit-subject">${iconMarkup('edit', { size: 13 })}Edit ${escapeHtml(subject.name)}</button>
    </section>

    <div class="hub-tabs">
      ${TABS.map((t) => `<button class="hub-tab${t.id === viewState.tab ? ' active' : ''}" data-select-tab="${t.id}">${iconMarkup(t.icon, { size: 14 })}${t.label}</button>`).join('')}
    </div>

    <section class="hub-content">${tabContent}</section>
  `;

  delegate(container, 'click', '[data-select-subject]', (e, t) => {
    viewState.subjectId = t.dataset.selectSubject; viewState.tab = 'overview';
    render(container, { state, params: {}, navigate });
  });
  delegate(container, 'click', '[data-select-tab]', (e, t) => {
    viewState.tab = t.dataset.selectTab;
    render(container, { state, params: {}, navigate });
  });
  delegate(container, 'click', '[data-action="add-subject"]', () => openSubjectForm(null));
  delegate(container, 'click', '[data-action="edit-subject"]', () => openSubjectForm(subject));
  delegate(container, 'click', '[data-action="prepare-now"]', () => navigate('focus', { subjectId: subject.id }));

  delegate(container, 'click', '[data-action="add-class"]', () => openSessionForm(subject.id, null));
  delegate(container, 'click', '[data-edit-class]', (e, t) => openSessionForm(subject.id, state.sessions.find((s) => s.id === t.dataset.editClass)));

  delegate(container, 'click', '[data-action="add-assignment"]', () => openAssignmentForm(subject.id, null));
  delegate(container, 'click', '[data-open-assignment]', (e, t) => openAssignmentForm(subject.id, state.assignments.find((a) => a.id === t.dataset.openAssignment)));

  delegate(container, 'click', '[data-action="add-assessment"]', () => openAssessmentForm(subject.id, null));
  delegate(container, 'click', '[data-open-assessment]', (e, t) => openAssessmentForm(subject.id, state.assessments.find((a) => a.id === t.dataset.openAssessment)));

  delegate(container, 'click', '[data-action="add-note"]', () => openNoteForm(subject.id, null));
  delegate(container, 'click', '[data-edit-note]', (e, t) => openNoteForm(subject.id, state.notes.find((n) => n.id === t.dataset.editNote)));

  delegate(container, 'click', '[data-action="add-card"]', () => openFlashcardForm(subject.id, null));
  delegate(container, 'click', '[data-edit-card]', (e, t) => openFlashcardForm(subject.id, state.flashcards.find((c) => c.id === t.dataset.editCard)));
  delegate(container, 'click', '[data-action="review"]', () => openReviewSession(state, subject.id));
  delegate(container, 'click', '[data-action="generate-quiz"]', () => {
    const result = generateQuiz(state, subject.id);
    if (result.error) { showToast(result.error); return; }
    mutate((s) => s.quizzes.push(result));
    showToast('Quiz generated');
  });
  delegate(container, 'click', '[data-open-quiz]', (e, t) => openQuizModal(state.quizzes.find((q) => q.id === t.dataset.openQuiz)));
}
