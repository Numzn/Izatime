import { todayKey } from '../core/dates.js';
import { resolveSubject, createSessionFromRow, newImportContext } from './timetableImport.js';

export const CSV_TEMPLATE_HEADER = 'subject,title,day,startTime,durationMinutes,lecturer,type,priority';

export const CSV_TEMPLATE = `${CSV_TEMPLATE_HEADER}
Digital Logic,IT221 - Digital Logic,MON,19:00,60,Pharrol Kazeze (Mr),school,2
Parallel and Distributed Systems,IT222 - Parallel and Distributed Systems,TUE,19:00,60,Priyah Mohan (Ms),school,2
`;

const REQUIRED = ['subject', 'title', 'day', 'starttime'];
const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const VALID_TYPES = ['school', 'study', 'exam-prep'];

function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; } else { inQuotes = false; }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

export function importTimetableCSV(state, csvText) {
  const rows = parseCSV(csvText);
  const ctx = newImportContext();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const missing = REQUIRED.filter((key) => !row[key]);
    if (missing.length) {
      ctx.result.skipped.push(`Row ${rowNumber}: missing ${missing.join(', ')}`);
      return;
    }

    const day = row.day.toUpperCase().slice(0, 3);
    if (!VALID_DAYS.includes(day)) {
      ctx.result.skipped.push(`Row ${rowNumber}: invalid day "${row.day}" (use MON..SUN)`);
      return;
    }

    const startTime = row.starttime;
    if (!/^\d{1,2}:\d{2}$/.test(startTime)) {
      ctx.result.skipped.push(`Row ${rowNumber}: invalid start time "${row.starttime}" (use HH:MM)`);
      return;
    }

    const subject = resolveSubject(state, { subjectHint: row.subject }, ctx);

    const type = VALID_TYPES.includes((row.type || '').toLowerCase()) ? row.type.toLowerCase() : 'school';
    const durationMinutes = Number(row.durationminutes) > 0 ? Number(row.durationminutes) : 60;
    const priority = [1, 2, 3].includes(Number(row.priority)) ? Number(row.priority) : 2;

    state.sessions.push(createSessionFromRow(subject, {
      title: row.title,
      type,
      date: todayKey(),
      startTime,
      durationMinutes,
      priority,
      recurrence: { days: [day], until: null },
      lecturer: row.lecturer || '',
    }));
    ctx.result.imported += 1;
  });

  return ctx.result;
}
