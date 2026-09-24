// One entry per list entity the client syncs. `key` matches the property
// name the client uses in its sync payload (and in its own state object —
// see js/core/models.js defaultState()); `model` is the Prisma Client
// accessor for it. `fields` are the mutable columns copied verbatim from
// the client's record on create/update — id, userId, createdAt, updatedAt
// and deletedAt are handled separately by the sync route itself.
export const LIST_ENTITIES = [
  { key: 'subjects', model: 'subject', fields: ['name', 'color', 'priority'] },
  {
    key: 'sessions',
    model: 'classSession',
    fields: ['subjectId', 'title', 'type', 'date', 'startTime', 'durationMinutes', 'priority', 'recurrence', 'lecturer', 'room', 'completions'],
  },
  { key: 'notes', model: 'note', fields: ['subjectId', 'title', 'body'] },
  { key: 'resources', model: 'resource', fields: ['subjectId', 'title', 'url'] },
  { key: 'flashcards', model: 'flashcard', fields: ['subjectId', 'front', 'back', 'srs'] },
  { key: 'quizzes', model: 'quiz', fields: ['subjectId', 'title', 'questions', 'source', 'attempts'] },
  { key: 'assessments', model: 'assessment', fields: ['subjectId', 'name', 'date', 'startTime', 'kind', 'weight'] },
  {
    key: 'assignments',
    model: 'assignment',
    fields: ['subjectId', 'title', 'dueDate', 'dueTime', 'description', 'type', 'estimatedMinutes', 'weight', 'links', 'checklist', 'status', 'priorityOverride'],
  },
  {
    key: 'focusSessions',
    model: 'focusSession',
    fields: ['subjectId', 'date', 'type', 'plannedMinutes', 'actualMinutes', 'completed', 'startedAt', 'endedAt'],
  },
];

// Settings and Term are one row per user, upserted by userId rather than
// synced as a list with client-generated ids.
export const SINGLETON_ENTITIES = [
  {
    key: 'settings',
    model: 'userSettings',
    fields: ['dailyGoalMinutes', 'quietHours', 'notificationsEnabled', 'notifyCategories', 'hapticsEnabled', 'focusMinutes', 'breakMinutes', 'longBreakMinutes', 'sessionsBeforeLongBreak', 'theme', 'timezone'],
  },
  { key: 'term', model: 'term', fields: ['label', 'startDate', 'endDate', 'asked'] },
];

export function pick(obj, fields) {
  const out = {};
  fields.forEach((f) => {
    if (obj[f] !== undefined) out[f] = obj[f];
  });
  return out;
}
