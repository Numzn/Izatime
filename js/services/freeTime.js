import { minutesFromHHMM, minutesToHHMM } from '../core/dates.js';
import { getSessionsForDate } from './scheduler.js';

// Free study periods, computed purely from classes that already exist —
// no separate "block out my time" feature to build or maintain. A gap only
// counts if it clears minMinutes, so a 10-minute breather between back-to-
// back classes doesn't get reported as "free time."
const DAY_START = '07:00';
const DAY_END = '22:00';
const DEFAULT_MIN_MINUTES = 45;

export function getFreePeriods(state, dateKey, { minMinutes = DEFAULT_MIN_MINUTES, fromMinutes = null } = {}) {
  const dayStartMinutes = minutesFromHHMM(DAY_START);
  const dayEndMinutes = minutesFromHHMM(DAY_END);
  const lowerBound = fromMinutes != null ? Math.max(dayStartMinutes, fromMinutes) : dayStartMinutes;

  const busy = getSessionsForDate(state, dateKey)
    .map(({ session }) => ({
      start: minutesFromHHMM(session.startTime),
      end: minutesFromHHMM(session.startTime) + session.durationMinutes,
      nextSession: session,
    }))
    .sort((a, b) => a.start - b.start);

  const periods = [];
  let cursor = lowerBound;

  busy.forEach(({ start, end, nextSession }) => {
    if (start > cursor && start - cursor >= minMinutes) {
      periods.push({
        startMinutes: cursor,
        endMinutes: start,
        durationMinutes: start - cursor,
        startTime: minutesToHHMM(cursor),
        endTime: minutesToHHMM(start),
        beforeSession: nextSession,
      });
    }
    cursor = Math.max(cursor, end);
  });

  if (dayEndMinutes - cursor >= minMinutes) {
    periods.push({
      startMinutes: cursor,
      endMinutes: dayEndMinutes,
      durationMinutes: dayEndMinutes - cursor,
      startTime: minutesToHHMM(cursor),
      endTime: minutesToHHMM(dayEndMinutes),
      beforeSession: null,
    });
  }

  return periods;
}

export function getNextFreePeriod(state, dateKey, options = {}) {
  return getFreePeriods(state, dateKey, options)[0] || null;
}
