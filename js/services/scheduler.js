import { dayCodeOf, addDays, minutesFromHHMM } from '../core/dates.js';

export function occursOn(session, dateKey) {
  if (session.recurrence) {
    const { days, until } = session.recurrence;
    if (!days.includes(dayCodeOf(dateKey))) return false;
    if (dateKey < session.date) return false;
    if (until && dateKey > until) return false;
    return true;
  }
  return session.date === dateKey;
}

export function isCompletedOn(session, dateKey) {
  return session.completions.includes(dateKey);
}

export function toggleCompletion(session, dateKey) {
  const pos = session.completions.indexOf(dateKey);
  if (pos >= 0) session.completions.splice(pos, 1);
  else session.completions.push(dateKey);
  return session;
}

export function getSessionsForDate(state, dateKey, { type } = {}) {
  return state.sessions
    .filter((s) => occursOn(s, dateKey) && (!type || s.type === type))
    .map((s) => ({ session: s, completed: isCompletedOn(s, dateKey) }))
    .sort((a, b) => minutesFromHHMM(a.session.startTime) - minutesFromHHMM(b.session.startTime));
}

export function getNextSession(state, { fromDateKey, fromMinutes = -1 } = {}) {
  for (let offset = 0; offset < 14; offset += 1) {
    const dateKey = addDays(fromDateKey, offset);
    const entries = getSessionsForDate(state, dateKey).filter((entry) => {
      if (entry.completed) return false;
      if (offset === 0) return minutesFromHHMM(entry.session.startTime) >= fromMinutes;
      return true;
    });
    if (entries.length) return { ...entries[0], dateKey };
  }
  return null;
}

export function getWeekOverview(state, startDateKey, days = 7) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const dateKey = addDays(startDateKey, i);
    out.push({ dateKey, entries: getSessionsForDate(state, dateKey) });
  }
  return out;
}

export function countTodayProgress(state, dateKey) {
  const entries = getSessionsForDate(state, dateKey);
  const total = entries.length;
  const done = entries.filter((e) => e.completed).length;
  return { total, done, remaining: total - done };
}
