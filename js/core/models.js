import { createId } from './id.js';
import { todayKey } from './dates.js';

export const SCHEMA_VERSION = 1;

export const SUBJECT_COLORS = ['#5b6df0', '#3fae74', '#c98a2e', '#d9635f', '#8a6fd8', '#4a9fb0', '#b06fae'];

export function defaultSRS() {
  return { easeFactor: 2.5, interval: 0, repetitions: 0, nextReviewAt: todayKey(), lastReviewedAt: null };
}

export function createSubject({ name, color, priority = 2 }) {
  return {
    id: createId(),
    name,
    color: color || SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)],
    priority,
    createdAt: new Date().toISOString(),
  };
}

export function createChecklistItem({ text }) {
  return { id: createId(), text, done: false };
}

export function createSession({
  subjectId,
  title,
  type = 'study',
  date = todayKey(),
  startTime = '16:00',
  durationMinutes = 30,
  priority = 2,
  recurrence = null,
  lecturer = '',
  room = '',
}) {
  return {
    id: createId(),
    subjectId,
    title,
    type,
    date,
    startTime,
    durationMinutes,
    priority,
    recurrence,
    lecturer,
    room,
    completions: [],
    createdAt: new Date().toISOString(),
  };
}

export function createNote({ subjectId, title, body = '' }) {
  const now = new Date().toISOString();
  return {
    id: createId(), subjectId, title, body, createdAt: now, updatedAt: now,
  };
}

// A link or reference for a subject — same shape/purpose as a Note, just
// pointing outward (a slide deck, a past-paper PDF, a reading) instead of
// holding the content itself.
export function createResource({ subjectId, title, url = '' }) {
  return {
    id: createId(), subjectId, title, url, createdAt: new Date().toISOString(),
  };
}

export function createFlashcard({ subjectId, front, back }) {
  return {
    id: createId(), subjectId, front, back, srs: defaultSRS(), createdAt: new Date().toISOString(),
  };
}

export function createQuiz({
  subjectId, title, questions = [], source = 'generated',
}) {
  return {
    id: createId(), subjectId, title, questions, source, attempts: [], createdAt: new Date().toISOString(),
  };
}

// An "assessment" is anything with a fixed sit-down time: quiz, test, exam,
// or practical. Distinct from an assignment (§ below), which has a
// deadline to submit by rather than a time to show up prepared for.
export function createAssessment({
  subjectId, name, date, startTime = null, kind = 'exam', weight = null,
}) {
  return {
    id: createId(), subjectId, name, date, startTime, kind, weight, createdAt: new Date().toISOString(),
  };
}

export const ASSIGNMENT_TYPES = ['homework', 'project', 'essay', 'lab', 'reading', 'other'];
export const ASSIGNMENT_STATUSES = ['not-started', 'in-progress', 'submitted', 'graded'];

export function createAssignment({
  subjectId,
  title,
  dueDate,
  dueTime = null,
  description = '',
  type = 'homework',
  estimatedMinutes = null,
  weight = null,
  links = [],
  checklist = [],
  priorityOverride = null,
}) {
  return {
    id: createId(),
    subjectId,
    title,
    dueDate,
    dueTime,
    description,
    type,
    estimatedMinutes,
    weight,
    links,
    checklist,
    status: 'not-started',
    priorityOverride,
    createdAt: new Date().toISOString(),
  };
}

export function createFocusSession({
  subjectId = null, type = 'focus', plannedMinutes,
}) {
  return {
    id: createId(),
    date: todayKey(),
    subjectId,
    type,
    plannedMinutes,
    actualMinutes: 0,
    completed: false,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
}

export function defaultSettings() {
  return {
    dailyGoalMinutes: 60,
    quietHours: { start: '22:00', end: '07:00' },
    notificationsEnabled: false,
    notifyCategories: {
      classes: true, assignments: true, assessments: true, neglected: true,
    },
    hapticsEnabled: true,
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    theme: 'system',
  };
}

export function defaultTerm() {
  // asked tracks whether the student has already been offered the
  // post-import "when does this end?" prompt once, so it doesn't nag on
  // every subsequent import once they've seen it (set or skipped).
  return {
    label: '', startDate: null, endDate: null, asked: false,
  };
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    // Bumped on every local write; compared against the synced copy's own
    // updatedAt to resolve sync conflicts (newest wins).
    updatedAt: new Date().toISOString(),
    subjects: [],
    sessions: [],
    notes: [],
    resources: [],
    flashcards: [],
    quizzes: [],
    assessments: [],
    assignments: [],
    focusSessions: [],
    settings: defaultSettings(),
    term: defaultTerm(),
    streak: { current: 0, longest: 0, lastActiveDate: null },
    notificationLog: [],
  };
}
