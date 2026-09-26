import { minutesFromHHMM } from '../core/dates.js';
import {
  resolveSubject, createSessionFromRow, findExistingSession, newImportContext,
} from './timetableImport.js';

const RRULE_DAY_TO_CODE = {
  MO: 'MON', TU: 'TUE', WE: 'WED', TH: 'THU', FR: 'FRI', SA: 'SAT', SU: 'SUN',
};

function unescapeICS(text) {
  return String(text || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function unfoldLines(text) {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  rawLines.forEach((line) => {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim() !== '') {
      lines.push(line);
    }
  });
  return lines;
}

function parseProperty(line) {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;
  const left = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...paramParts] = left.split(';');
  const params = {};
  paramParts.forEach((p) => {
    const [k, v] = p.split('=');
    if (k) params[k.toUpperCase()] = v;
  });
  return { name: name.toUpperCase(), params, value };
}

// Digits are read as local wall-clock time regardless of a trailing "Z" or
// a TZID param — same floating-local-time model this app's own export
// uses. If the source calendar was authored in another timezone, imported
// times may be off; edit the class afterward if so.
function parseICSDate(value, params) {
  const isAllDay = params.VALUE === 'DATE' || !/T/.test(value);
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (isAllDay) return { date, time: null, allDay: true };
  return { date, time: `${value.slice(9, 11)}:${value.slice(11, 13)}`, allDay: false };
}

function parseVEvent(lines) {
  const event = {
    uid: null, summary: '', location: '', lecturer: '', dtstart: null, dtend: null, rrule: null,
  };
  lines.forEach((line) => {
    const prop = parseProperty(line);
    if (!prop) return;
    if (prop.name === 'UID') event.uid = prop.value;
    else if (prop.name === 'SUMMARY') event.summary = unescapeICS(prop.value).trim();
    else if (prop.name === 'LOCATION') event.location = unescapeICS(prop.value).trim();
    else if (prop.name === 'DTSTART') event.dtstart = parseICSDate(prop.value, prop.params);
    else if (prop.name === 'DTEND') event.dtend = parseICSDate(prop.value, prop.params);
    else if (prop.name === 'RRULE') event.rrule = prop.value;
    // ORGANIZER's CN param carries a display name where present — the
    // closest thing .ics has to a lecturer field, since there is no
    // dedicated one in the spec.
    else if (prop.name === 'ORGANIZER' && prop.params.CN) {
      event.lecturer = unescapeICS(prop.params.CN.replace(/^"|"$/g, '')).trim();
    }
  });
  return event;
}

export function parseICS(text) {
  const lines = unfoldLines(text);
  const events = [];
  let current = null;
  lines.forEach((line) => {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') current = [];
    else if (upper === 'END:VEVENT') {
      if (current) events.push(parseVEvent(current));
      current = null;
    } else if (current) current.push(line);
  });
  return events;
}

function parseRRule(rrule) {
  if (!rrule) return null;
  const parts = {};
  rrule.split(';').forEach((p) => {
    const [k, v] = p.split('=');
    if (k) parts[k.toUpperCase()] = v;
  });
  // Only weekly-by-day recurrence maps onto this app's recurrence model;
  // anything else (daily/monthly/yearly, or weekly with no BYDAY) is
  // imported as a single one-off class on its DTSTART date instead.
  if (parts.FREQ !== 'WEEKLY' || !parts.BYDAY) return null;
  const days = parts.BYDAY.split(',').map((d) => RRULE_DAY_TO_CODE[d]).filter(Boolean);
  if (!days.length) return null;
  const until = parts.UNTIL
    ? `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}`
    : null;
  return { days, until };
}

function durationMinutes(dtstart, dtend) {
  if (!dtend || !dtend.time) return 60;
  let diff = minutesFromHHMM(dtend.time) - minutesFromHHMM(dtstart.time);
  if (dtend.date !== dtstart.date) diff += 1440;
  return diff > 0 ? diff : 60;
}

// Imports classes from an external calendar file. This app's own .ics
// exports (icsExport.js) are one-way by design — re-importing them would
// just duplicate data already here, so events carrying that export's UID
// signature are recognized and skipped rather than imported.
export function importTimetableICS(state, icsText) {
  const events = parseICS(icsText);
  const ctx = newImportContext();

  events.forEach((event, index) => {
    const label = event.summary || `Event ${index + 1}`;

    // Matches the exact shape icsExport.js writes: "session-<id>@numzstudy",
    // "assessment-<id>@numzstudy", "assignment-<id>@numzstudy" (plus the
    // pre-rename "@digital-timetable" suffix). A plain substring/suffix check
    // on "@numzstudy" alone is too loose — an external calendar's own UID
    // domain can coincidentally end the same way (this app's own name isn't
    // a reserved word), which would silently reject a real import outright.
    if (event.uid && /^(session|assessment|assignment)-.+@(numzstudy|digital-timetable)$/.test(event.uid)) {
      ctx.result.skipped.push(`"${label}": already in this app (its own export), skipped`);
      return;
    }
    if (!event.summary) {
      ctx.result.skipped.push(`Event ${index + 1}: missing a title`);
      return;
    }
    if (!event.dtstart) {
      ctx.result.skipped.push(`"${label}": missing a start date/time`);
      return;
    }
    if (event.dtstart.allDay) {
      // No time/day to build a class from (e.g. a course-enrollment export
      // that just lists "you're enrolled in X" once, with no room/time/day
      // of its own) — add the subject, matched or created by exact name, so
      // it exists ready to schedule instead of the course being dropped
      // entirely. No session is created since there's nothing to put on the
      // timetable yet.
      resolveSubject(state, { subjectHint: event.summary }, ctx);
      return;
    }

    const subject = resolveSubject(
      state,
      { titleForFallbackMatch: event.summary, fallbackSubjectName: 'Imported' },
      ctx,
    );

    const newRow = {
      title: event.summary,
      date: event.dtstart.date,
      startTime: event.dtstart.time,
      durationMinutes: durationMinutes(event.dtstart, event.dtend),
      room: event.location || '',
      lecturer: event.lecturer || '',
      recurrence: parseRRule(event.rrule),
    };

    // Catches re-importing the same external calendar file a second time
    // (the UID check above only catches this app's own prior exports
    // coming back in, not a source calendar re-exported and re-imported).
    if (findExistingSession(state, subject, newRow)) {
      ctx.result.skipped.push(`"${label}": already imported, skipped`);
      return;
    }

    state.sessions.push(createSessionFromRow(subject, newRow, state));
    ctx.result.imported += 1;
  });

  return ctx.result;
}
