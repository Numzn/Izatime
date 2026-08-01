import { todayKey } from '../core/dates.js';
import { mutate, getState } from '../core/store.js';
import { createNote, createFlashcard } from '../core/models.js';
import { review, getDueFlashcards, masteryLabel } from '../services/spacedRepetition.js';
import { generateQuiz, getStudyStrategy } from '../services/aiCoach.js';
import { escapeHtml, delegate, clear } from '../components/dom.js';
import { openModal, confirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { iconMarkup } from '../components/icons.js';

const TABS = [
  { id: 'notes', label: 'Notes', icon: 'notebook' },
  { id: 'flashcards', label: 'Cards', icon: 'layers' },
  { id: 'quizzes', label: 'Quizzes', icon: 'help-circle' },
  { id: 'topics', label: 'Topics', icon: 'target' },
];

const MASTERY_LABEL = { new: 'New', learning: 'Learning', mastered: 'Mastered' };

const viewState = { subjectId: null, tab: 'notes' };

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

function textArea(value = '', placeholder = '') {
  const t = document.createElement('textarea');
  t.value = value; t.placeholder = placeholder; t.rows = 4;
  return t;
}

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
            const note = s.notes.find((n) => n.id === existing.id);
            Object.assign(note, { title, body: bodyInput.value, updatedAt: new Date().toISOString() });
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
          if (existing) {
            Object.assign(s.flashcards.find((c) => c.id === existing.id), { front, back });
          } else {
            s.flashcards.push(createFlashcard({ subjectId, front, back }));
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
        if (!(await confirmModal({ message: 'Delete this flashcard?' }))) return;
        mutate((s) => { s.flashcards = s.flashcards.filter((c) => c.id !== existing.id); });
      },
    });
  }
  openModal({ title: existing ? 'Edit flashcard' : 'New flashcard', bodyNode: body, actions });
}

function openReviewSession(subjectId) {
  const state = getState();
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
    const cardEl = body.querySelector('.flashcard');
    cardEl.addEventListener('click', () => { showingBack = !showingBack; draw(); });
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
      if (index >= queue.length) {
        close();
        showToast('Review complete');
      } else {
        draw();
      }
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
        radio.type = 'radio';
        radio.name = `q${qi}`;
        radio.disabled = submitted;
        radio.checked = answers[qi] === oi;
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
          mutate((s) => {
            const q = s.quizzes.find((x) => x.id === quiz.id);
            q.attempts.push({ date: todayKey(), score, total: quiz.questions.length });
          });
          draw();
        },
      },
    ],
  });
}

export function render(container, { state, params, navigate }) {
  if (params?.subjectId) viewState.subjectId = params.subjectId;
  if (!state.subjects.some((s) => s.id === viewState.subjectId)) {
    viewState.subjectId = state.subjects[0]?.id || null;
  }

  if (!state.subjects.length) {
    container.innerHTML = '<div class="empty-state"><p>Add a subject in Planner to open the Learning Hub.</p></div>';
    return;
  }

  const subject = state.subjects.find((s) => s.id === viewState.subjectId);
  const notes = state.notes.filter((n) => n.subjectId === subject.id);
  const cards = state.flashcards.filter((c) => c.subjectId === subject.id);
  const dueCount = getDueFlashcards(state).filter((c) => c.subjectId === subject.id).length;
  const quizzes = state.quizzes.filter((q) => q.subjectId === subject.id);
  const topics = state.topics.filter((t) => t.subjectId === subject.id);

  container.innerHTML = `
    <section class="hub-subjects">
      <div class="subject-chip-row">
        ${state.subjects.map((s) => `
          <button class="subject-chip${s.id === subject.id ? ' selected' : ''}" data-select-subject="${s.id}" style="--chip-color:${s.color}">
            <span class="chip-dot"></span>${escapeHtml(s.name)}
          </button>
        `).join('')}
      </div>
    </section>

    <div class="hub-tabs">
      ${TABS.map((t) => `<button class="hub-tab${t.id === viewState.tab ? ' active' : ''}" data-select-tab="${t.id}">${iconMarkup(t.icon, { size: 14 })}${t.label}</button>`).join('')}
    </div>

    <section class="hub-content">
      ${viewState.tab === 'notes' ? `
        <div class="section-header"><h2>Notes</h2><button class="btn-chip" data-action="add-note">+ Add</button></div>
        ${notes.length ? `<div class="note-list">${notes.map((n) => `
          <button class="note-card" data-edit-note="${n.id}">
            <span class="note-title">${escapeHtml(n.title)}</span>
            <span class="note-preview">${escapeHtml(n.body.slice(0, 80))}</span>
          </button>`).join('')}</div>` : '<p class="empty-state-inline">No notes yet.</p>'}
      ` : ''}

      ${viewState.tab === 'flashcards' ? `
        <div class="section-header"><h2>Flashcards</h2><button class="btn-chip" data-action="add-card">+ Add</button></div>
        ${dueCount ? `<button class="btn btn-primary review-cta" data-action="review">Review ${dueCount} due card${dueCount === 1 ? '' : 's'}</button>` : ''}
        ${cards.length ? `<div class="card-list">${cards.map((c) => `
          <button class="card-row" data-edit-card="${c.id}">
            <span>${escapeHtml(c.front.slice(0, 60))}</span>
            <span class="badge badge-${masteryLabel(c.srs)}">${MASTERY_LABEL[masteryLabel(c.srs)]}</span>
          </button>`).join('')}</div>` : '<p class="empty-state-inline">No flashcards yet.</p>'}
      ` : ''}

      ${viewState.tab === 'quizzes' ? `
        <div class="section-header"><h2>Quizzes</h2><button class="btn-chip" data-action="generate-quiz">${iconMarkup('spark', { size: 12 })}Generate</button></div>
        ${quizzes.length ? `<div class="quiz-list">${quizzes.slice().reverse().map((q) => {
          const last = q.attempts[q.attempts.length - 1];
          return `<button class="quiz-row" data-open-quiz="${q.id}">
            <span>${escapeHtml(q.title)} · ${q.questions.length}q</span>
            <span>${last ? `${last.score}/${last.total}` : 'Not taken'}</span>
          </button>`;
        }).join('')}</div>` : '<p class="empty-state-inline">Generate a quiz from your flashcards.</p>'}
      ` : ''}

      ${viewState.tab === 'topics' ? `
        <div class="section-header"><h2>Topics</h2><button class="btn-chip" data-action="go-planner">Manage in Planner</button></div>
        ${topics.length ? `<div class="topic-list">${topics.map((t) => `
          <button class="topic-row" data-view-topic="${t.id}">
            <span>${escapeHtml(t.name)}</span>
            <span class="badge badge-${masteryLabel(t.srs)}">${MASTERY_LABEL[masteryLabel(t.srs)]}</span>
          </button>`).join('')}</div>` : '<p class="empty-state-inline">No topics yet.</p>'}
      ` : ''}
    </section>
  `;

  delegate(container, 'click', '[data-select-subject]', (e, t) => {
    viewState.subjectId = t.dataset.selectSubject;
    render(container, { state, params: {}, navigate });
  });
  delegate(container, 'click', '[data-select-tab]', (e, t) => {
    viewState.tab = t.dataset.selectTab;
    render(container, { state, params: {}, navigate });
  });

  delegate(container, 'click', '[data-action="add-note"]', () => openNoteForm(subject.id, null));
  delegate(container, 'click', '[data-edit-note]', (e, t) => openNoteForm(subject.id, notes.find((n) => n.id === t.dataset.editNote)));
  delegate(container, 'click', '[data-action="add-card"]', () => openFlashcardForm(subject.id, null));
  delegate(container, 'click', '[data-edit-card]', (e, t) => openFlashcardForm(subject.id, cards.find((c) => c.id === t.dataset.editCard)));
  delegate(container, 'click', '[data-action="review"]', () => openReviewSession(subject.id));
  delegate(container, 'click', '[data-action="generate-quiz"]', () => {
    const result = generateQuiz(state, subject.id);
    if (result.error) { showToast(result.error); return; }
    mutate((s) => s.quizzes.push(result));
    showToast('Quiz generated');
  });
  delegate(container, 'click', '[data-open-quiz]', (e, t) => openQuizModal(quizzes.find((q) => q.id === t.dataset.openQuiz)));
  delegate(container, 'click', '[data-view-topic]', (e, t) => {
    const topic = topics.find((x) => x.id === t.dataset.viewTopic);
    showToast(getStudyStrategy(topic));
  });
  delegate(container, 'click', '[data-action="go-planner"]', () => navigate('planner', { subjectId: subject.id }));
}
