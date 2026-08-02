export const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const WEEK_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dateToKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayKey() {
  return dateToKey(new Date());
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

export function mondayOf(key) {
  return addDays(key, -WEEK_ORDER.indexOf(dayCodeOf(key)));
}

export function diffInDays(fromKey, toKey) {
  const ms = keyToDate(toKey).getTime() - keyToDate(fromKey).getTime();
  return Math.round(ms / 86400000);
}

export function isPastKey(key, referenceKey = todayKey()) {
  return diffInDays(referenceKey, key) < 0;
}

export function isTodayKey(key) {
  return key === todayKey();
}

export function formatDayLabel(key) {
  const d = keyToDate(key);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime24(hhmm) {
  return hhmm;
}

export function minutesFromHHMM(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesBetween(startHHMM, endHHMM) {
  const diff = minutesFromHHMM(endHHMM) - minutesFromHHMM(startHHMM);
  return diff > 0 ? diff : 0;
}

export function minutesToHHMM(totalMinutes) {
  const clamped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

export function nowHHMM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function isWithinQuietHours(quietHours, hhmm = nowHHMM()) {
  if (!quietHours || !quietHours.start || !quietHours.end) return false;
  const now = minutesFromHHMM(hhmm);
  const start = minutesFromHHMM(quietHours.start);
  const end = minutesFromHHMM(quietHours.end);
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function last7Days(referenceKey = todayKey()) {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) out.push(addDays(referenceKey, -i));
  return out;
}

export function lastNDays(n, referenceKey = todayKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(addDays(referenceKey, -i));
  return out;
}

export function formatMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
