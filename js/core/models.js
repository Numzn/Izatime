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

export function createTopic({ subjectId, name, difficulty = 2 }) {
  return {
    id: createId(),
    subjectId,
    name,
    status: 'new',
    difficulty,
    srs: defaultSRS(),
    createdAt: new Date().toISOString(),
  };
}

export function createChecklistItem({ text }) {
  return { id: createId(), text, done: false };
}

export function createSession({
  subjectId,
  topicId = null,
  title,
  type = 'study',
  date = todayKey(),
  startTime = '16:00',
  durationMinutes = 30,
  priority = 2,
  recurrence = null,
  lecturer = '',
  room = '',
  checklist = [],
}) {
  return {
    id: createId(),
    subjectId,
    topicId,
    title,
    type,
    date,
    startTime,
    durationMinutes,
    priority,
    recurrence,
    lecturer,
    room,
    checklist,
    completions: [],
    createdAt: new Date().toISOString(),
  };
}

export function createNote({ subjectId, topicId = null, title, body = '' }) {
  const now = new Date().toISOString();
  return {
    id: createId(), subjectId, topicId, title, body, createdAt: now, updatedAt: now,
  };
}

export function createFlashcard({ subjectId, topicId = null, front, back }) {
  return {
    id: createId(), subjectId, topicId, front, back, srs: defaultSRS(), createdAt: new Date().toISOString(),
  };
}

export function createQuiz({
  subjectId, topicId = null, title, questions = [], source = 'generated',
}) {
  return {
    id: createId(), subjectId, topicId, title, questions, source, attempts: [], createdAt: new Date().toISOString(),
  };
}

// An "assessment" is anything with a fixed sit-down time: quiz, test, exam,
// or practical. Distinct from an assignment (§ below), which has a
// deadline to submit by rather than a time to show up prepared for.
export function createAssessment({
  subjectId, name, date, startTime = null, kind = 'exam', weight = null, topicIds = [], checklist = [],
}) {
  return {
    id: createId(), subjectId, name, date, startTime, kind, weight, topicIds, checklist, createdAt: new Date().toISOString(),
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
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    theme: 'system',
  };
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    // Bumped on every local write; compared against the synced copy's own
    // updatedAt to resolve sync conflicts (newest wins).
    updatedAt: new Date().toISOString(),
    subjects: [],
    topics: [],
    sessions: [],
    notes: [],
    flashcards: [],
    quizzes: [],
    assessments: [],
    assignments: [],
    focusSessions: [],
    settings: defaultSettings(),
    streak: { current: 0, longest: 0, lastActiveDate: null },
    notificationLog: [],
  };
}
