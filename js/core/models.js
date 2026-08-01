import { createId } from './id.js';
import { todayKey } from './dates.js';

export const SCHEMA_VERSION = 1;

export const SUBJECT_COLORS = ['#4d7cff', '#ff6b6b', '#2fb380', '#f0a500', '#9a6cff', '#ff8fb1', '#2bb8c4'];

export function defaultSRS() {
  return { easeFactor: 2.5, interval: 0, repetitions: 0, nextReviewAt: todayKey(), lastReviewedAt: null };
}

export function createSubject({ name, color, icon = '📘', priority = 2 }) {
  return {
    id: createId(),
    name,
    color: color || SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)],
    icon,
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

export function createExam({
  subjectId, name, date, topicIds = [],
}) {
  return {
    id: createId(), subjectId, name, date, topicIds, createdAt: new Date().toISOString(),
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
    subjects: [],
    topics: [],
    sessions: [],
    notes: [],
    flashcards: [],
    quizzes: [],
    exams: [],
    focusSessions: [],
    settings: defaultSettings(),
    streak: { current: 0, longest: 0, lastActiveDate: null },
    notificationLog: [],
  };
}
