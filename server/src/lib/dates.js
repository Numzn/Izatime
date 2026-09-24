// Server-side counterpart to js/core/dates.js. Date-key arithmetic
// (addDays, diffInDays, dayCodeOf, minutesFromHHMM...) is pure string/date
// math and works identically here — the server's own local timezone never
// enters into it. What *does* need a server-specific version is anything
// that reads "now": the client always meant "now in the device's own
// timezone," and the server has no device to ask, so every user carries
// their own IANA timezone (settings.timezone, captured client-side via
// Intl.DateTimeFormat().resolvedOptions().timeZone and synced up like any
// other setting) and todayKeyInTz/nowHHMMInTz below use it explicitly.

export const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dateToKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayCodeOf(key) {
  return DAY_CODES[keyToDate(key).getDay()];
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dateToKey(d);
}

export function diffInDays(fromKey, toKey) {
  const ms = keyToDate(toKey).getTime() - keyToDate(fromKey).getTime();
  return Math.round(ms / 86400000);
}

export function minutesFromHHMM(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isWithinQuietHours(quietHours, hhmm) {
  if (!quietHours || !quietHours.start || !quietHours.end) return false;
  const now = minutesFromHHMM(hhmm);
  const start = minutesFromHHMM(quietHours.start);
  const end = minutesFromHHMM(quietHours.end);
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function todayKeyInTz(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return parts; // en-CA formats as YYYY-MM-DD
  } catch (error) {
    return dateToKey(new Date());
  }
}

export function nowHHMMInTz(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch (error) {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
}
