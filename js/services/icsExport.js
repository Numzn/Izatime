import { addDays } from '../core/dates.js';
import { isAssignmentDone } from './assignments.js';

// ICS weekday codes differ from ours (2-letter, not 3).
const ICS_DAY = {
  MON: 'MO', TUE: 'TU', WED: 'WE', THU: 'TH', FRI: 'FR', SAT: 'SA', SUN: 'SU',
};

function escapeICS(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function dateStamp(dateKey) {
  return dateKey.replace(/-/g, '');
}

function dateTimeStamp(dateKey, timeHHMM) {
  const [h, m] = (timeHHMM || '00:00').split(':');
  return `${dateStamp(dateKey)}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
}

function nowStampUTC() {
  return `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function addMinutesToHHMM(hhmm, minutesToAdd) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60) + m + minutesToAdd) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function vevent(lines) {
  return ['BEGIN:VEVENT', ...lines.filter(Boolean), 'END:VEVENT'];
}

// One-way export only, by design: this app stays the source of truth, the
// student's calendar app becomes the delivery mechanism for reminders a
// browser tab can't reliably deliver in the background. Re-downloading and
// re-importing overwrites previous events with the same UID in most
// calendar apps, which is the simplest "stays current" story without a
// live subscription endpoint (this is a static site — there's nowhere to
// host one).
export function buildICS(state) {
  const subjectName = (id) => state.subjects.find((s) => s.id === id)?.name || '';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Digital Timetable//EN', 'CALSCALE:GREGORIAN'];

  state.sessions.forEach((session) => {
    const endTime = addMinutesToHHMM(session.startTime, session.durationMinutes);
    const eventLines = [
      `UID:session-${session.id}@digital-timetable`,
      `DTSTAMP:${nowStampUTC()}`,
      `DTSTART:${dateTimeStamp(session.date, session.startTime)}`,
      `DTEND:${dateTimeStamp(session.date, endTime)}`,
      `SUMMARY:${escapeICS(session.title)}`,
    ];
    const desc = [subjectName(session.subjectId), session.lecturer].filter(Boolean).join(' · ');
    if (desc) eventLines.push(`DESCRIPTION:${escapeICS(desc)}`);
    if (session.room) eventLines.push(`LOCATION:${escapeICS(session.room)}`);
    if (session.recurrence) {
      const byDay = session.recurrence.days.map((d) => ICS_DAY[d]).filter(Boolean).join(',');
      let rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`;
      if (session.recurrence.until) rrule += `;UNTIL=${dateStamp(session.recurrence.until)}T235959Z`;
      eventLines.push(rrule);
    }
    lines.push(...vevent(eventLines));
  });

  state.assessments.forEach((assessment) => {
    const timed = !!assessment.startTime;
    const eventLines = [
      `UID:assessment-${assessment.id}@digital-timetable`,
      `DTSTAMP:${nowStampUTC()}`,
      timed ? `DTSTART:${dateTimeStamp(assessment.date, assessment.startTime)}` : `DTSTART;VALUE=DATE:${dateStamp(assessment.date)}`,
      timed ? `DTEND:${dateTimeStamp(assessment.date, addMinutesToHHMM(assessment.startTime, 60))}` : `DTEND;VALUE=DATE:${dateStamp(addDays(assessment.date, 1))}`,
      `SUMMARY:${escapeICS(`${assessment.kind}: ${assessment.name}`)}`,
    ];
    if (subjectName(assessment.subjectId)) eventLines.push(`DESCRIPTION:${escapeICS(subjectName(assessment.subjectId))}`);
    lines.push(...vevent(eventLines));
  });

  state.assignments.filter((a) => !isAssignmentDone(a)).forEach((assignment) => {
    const timed = !!assignment.dueTime;
    const eventLines = [
      `UID:assignment-${assignment.id}@digital-timetable`,
      `DTSTAMP:${nowStampUTC()}`,
      timed ? `DTSTART:${dateTimeStamp(assignment.dueDate, assignment.dueTime)}` : `DTSTART;VALUE=DATE:${dateStamp(assignment.dueDate)}`,
      timed ? `DTEND:${dateTimeStamp(assignment.dueDate, addMinutesToHHMM(assignment.dueTime, 30))}` : `DTEND;VALUE=DATE:${dateStamp(addDays(assignment.dueDate, 1))}`,
      `SUMMARY:${escapeICS(`Due: ${assignment.title}`)}`,
    ];
    if (subjectName(assignment.subjectId)) eventLines.push(`DESCRIPTION:${escapeICS(subjectName(assignment.subjectId))}`);
    lines.push(...vevent(eventLines));
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
