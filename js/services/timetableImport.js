import { createSubject, createSession } from '../core/models.js';

// Shared by every timetable import path (CSV, ICS, and any future format)
// so "how do we turn an imported row into a subject" only has one answer,
// no matter which file it came from.
//
// A subjectHint (a dedicated subject field the format actually provides —
// e.g. CSV's "subject" column) is matched by exact name, and a new subject
// is created named exactly as given when nothing matches — there's no
// ambiguity, the format told us the subject directly. Without a hint (an
// .ics event only ever has a free-text title, never a separate subject
// field), matching falls back to substring — does the title contain an
// existing subject's name? — and anything still unmatched is grouped under
// one shared fallback subject rather than guessing at a name from thin air.
export function resolveSubject(state, { subjectHint, titleForFallbackMatch, fallbackSubjectName }, ctx) {
  if (subjectHint) {
    let subject = state.subjects.find((s) => s.name.toLowerCase() === subjectHint.toLowerCase());
    if (!subject) {
      subject = createSubject({ name: subjectHint });
      state.subjects.push(subject);
      ctx.result.subjectsCreated += 1;
    }
    return subject;
  }

  const matched = state.subjects.find(
    (s) => titleForFallbackMatch.toLowerCase().includes(s.name.toLowerCase()),
  );
  if (matched) return matched;

  if (!ctx.fallbackSubject) {
    ctx.fallbackSubject = state.subjects.find((s) => s.name === fallbackSubjectName);
    if (!ctx.fallbackSubject) {
      ctx.fallbackSubject = createSubject({ name: fallbackSubjectName });
      state.subjects.push(ctx.fallbackSubject);
      ctx.result.subjectsCreated += 1;
    }
  }
  return ctx.fallbackSubject;
}

// The one place a session gets built from an imported row, so a field
// either adapter forgets to pass through can't quietly differ between them.
// A weekly recurrence with no explicit end date defaults to the term's end
// date once one is set, instead of running forever or asking per-row —
// the semester is the master data for "when does this stop," not each row.
export function createSessionFromRow(subject, row, state) {
  const recurrence = row.recurrence
    ? { days: row.recurrence.days, until: row.recurrence.until || state?.term?.endDate || null }
    : null;
  return createSession({
    subjectId: subject.id,
    title: row.title,
    type: row.type || 'school',
    date: row.date,
    startTime: row.startTime,
    durationMinutes: row.durationMinutes,
    priority: row.priority || 2,
    recurrence,
    lecturer: row.lecturer || '',
    room: row.room || '',
  });
}

export function newImportContext() {
  return { result: { imported: 0, subjectsCreated: 0, skipped: [] }, fallbackSubject: null };
}
