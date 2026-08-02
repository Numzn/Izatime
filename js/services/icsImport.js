import { createSubject, createSession } from '../core/models.js';
import { minutesFromHHMM } from '../core/dates.js';

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
    uid: null, summary: '', location: '', dtstart: null, dtend: null, rrule: null,
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
  const result = { imported: 0, subjectsCreated: 0, skipped: [] };
  let importedSubject = null;

  events.forEach((event, index) => {
    const label = event.summary || `Event ${index + 1}`;

    if (event.uid && event.uid.includes('@digital-timetable')) {
      result.skipped.push(`"${label}": already in this app (its own export), skipped`);
      return;
    }
    if (!event.summary) {
      result.skipped.push(`Event ${index + 1}: missing a title`);
      return;
    }
    if (!event.dtstart) {
      result.skipped.push(`"${label}": missing a start date/time`);
      return;
    }
    if (event.dtstart.allDay) {
      result.skipped.push(`"${label}": all-day events aren't imported as classes`);
      return;
    }

    let subject = state.subjects.find((s) => event.summary.toLowerCase().includes(s.name.toLowerCase()));
    if (!subject) {
      if (!importedSubject) {
        importedSubject = state.subjects.find((s) => s.name === 'Imported');
        if (!importedSubject) {
          importedSubject = createSubject({ name: 'Imported' });
          state.subjects.push(importedSubject);
          result.subjectsCreated += 1;
        }
      }
      subject = importedSubject;
    }

    state.sessions.push(createSession({
      subjectId: subject.id,
      title: event.summary,
      date: event.dtstart.date,
      startTime: event.dtstart.time,
      durationMinutes: durationMinutes(event.dtstart, event.dtend),
      room: event.location || '',
      recurrence: parseRRule(event.rrule),
    }));
    result.imported += 1;
  });

  return result;
}
