import {
  addDays, diffInDays, isWithinQuietHours, minutesFromHHMM, nowHHMM, todayKey,
} from '../core/dates.js';
import { mutate, getState } from '../core/store.js';
import { getSessionsForDate } from './scheduler.js';
import { getNeglectedSubjects } from './aiCoach.js';
import {
  getAssignmentsDueWithin, getUpcomingAssessments, isAssignmentDone, reminderLeadDays,
} from './assignments.js';
import { vibrate, PATTERNS } from './haptics.js';

const MAX_PER_DAY = 3;
const LOG_HISTORY = 14;

export function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permissionState() {
  return isSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

function getTodayLog(state, dateKey) {
  return state.notificationLog.find((entry) => entry.date === dateKey);
}

function recordNotification(dateKey, key) {
  mutate((state) => {
    let entry = getTodayLog(state, dateKey);
    if (!entry) {
      entry = { date: dateKey, count: 0, notifiedKeys: [] };
      state.notificationLog.push(entry);
      if (state.notificationLog.length > LOG_HISTORY) state.notificationLog.shift();
    }
    entry.count += 1;
    entry.notifiedKeys.push(key);
  });
}

function subjectLabel(state, subjectId, title) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  return subject ? `${subject.name} — ${title}` : title;
}

// Class tiers: 1 day before (fires any time the day before — there's no
// way to pin an exact hour without background delivery), 1 hour before,
// 10 minutes before. The 10-minute tier is exempt from the daily cap in
// tick() below — missing a class is the actual mission, a habit nudge is
// not worth spending the same budget on.
function classCandidates(state, dateKey, minutesNow) {
  const candidates = [];
  const tomorrowKey = addDays(dateKey, 1);

  getSessionsForDate(state, tomorrowKey).forEach(({ session, completed }) => {
    if (completed) return;
    candidates.push({
      key: `session:${session.id}:${tomorrowKey}:1day`,
      urgency: 2,
      title: 'Tomorrow',
      body: `${subjectLabel(state, session.subjectId, session.title)} is tomorrow at ${session.startTime}.`,
    });
  });

  getSessionsForDate(state, dateKey).forEach(({ session, completed }) => {
    if (completed) return;
    const minsAway = minutesFromHHMM(session.startTime) - minutesNow;
    const label = subjectLabel(state, session.subjectId, session.title);
    if (minsAway > 45 && minsAway <= 75) {
      candidates.push({
        key: `session:${session.id}:${dateKey}:1hour`,
        urgency: 3,
        title: 'Starting soon',
        body: `${label} starts in about an hour.`,
      });
    } else if (minsAway > 0 && minsAway <= 15) {
      candidates.push({
        key: `session:${session.id}:${dateKey}:10min`,
        urgency: 4,
        title: 'Starting soon',
        body: `${label} starts in ${minsAway} minute${minsAway === 1 ? '' : 's'}.`,
        exemptFromCap: true,
      });
    }
  });

  return candidates;
}

// Assignment tiers: an effort-scaled lead-time reminder, then 3 days,
// 1 day, and day-of. Stops entirely once marked submitted/graded.
function assignmentCandidates(state, dateKey) {
  return getAssignmentsDueWithin(state, 14, dateKey)
    .filter((a) => !isAssignmentDone(a))
    .map((a) => {
      const daysLeft = diffInDays(dateKey, a.dueDate);
      const lead = reminderLeadDays(a);
      let tier = null;
      if (daysLeft === 0) tier = 'dueday';
      else if (daysLeft === 1) tier = '1day';
      else if (daysLeft === 3) tier = '3day';
      else if (daysLeft === lead && lead > 3) tier = 'lead';
      if (!tier) return null;
      const label = subjectLabel(state, a.subjectId, a.title);
      return {
        key: `assignment:${a.id}:${dateKey}:${tier}`,
        urgency: daysLeft <= 1 ? 4 : 2,
        title: daysLeft === 0 ? 'Due today' : 'Assignment due soon',
        body: daysLeft === 0 ? `${label} is due today.` : `${label} is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
      };
    })
    .filter(Boolean);
}

// Assessment tiers: 1 week, 3 days, 1 day before, plus day-of.
function assessmentCandidates(state, dateKey) {
  return getUpcomingAssessments(state, 7, dateKey)
    .map((a) => {
      const daysLeft = diffInDays(dateKey, a.date);
      if (![7, 3, 1, 0].includes(daysLeft)) return null;
      const label = subjectLabel(state, a.subjectId, a.name);
      return {
        key: `assessment:${a.id}:${dateKey}:${daysLeft}`,
        urgency: daysLeft <= 1 ? 4 : 2,
        title: daysLeft === 0 ? 'Today' : 'Assessment coming up',
        body: daysLeft === 0 ? `${label} is today. Good luck!` : `${label} is in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
      };
    })
    .filter(Boolean);
}

function buildCandidates(state, dateKey, minutesNow) {
  const categories = state.settings.notifyCategories || {};
  const candidates = [];

  if (categories.classes !== false) candidates.push(...classCandidates(state, dateKey, minutesNow));
  if (categories.assignments !== false) candidates.push(...assignmentCandidates(state, dateKey));
  if (categories.assessments !== false) candidates.push(...assessmentCandidates(state, dateKey));

  if (categories.neglected !== false) {
    getNeglectedSubjects(state, 7, dateKey).slice(0, 1).forEach(({ subject }) => {
      candidates.push({
        key: `neglect:${subject.id}:${dateKey}`,
        urgency: 1,
        title: 'Time to revisit',
        body: `You haven't reviewed ${subject.name} this week. Schedule a revision session?`,
      });
    });
  }

  return candidates.sort((a, b) => b.urgency - a.urgency);
}

// A shared static tag would let a same-tag replacement silently swap in
// without re-alerting on some platforms; tagging by the candidate's own
// dedup key instead means every distinct notification actually alerts.
// requireInteraction/vibrate make the time-critical ones ("insistent")
// harder to miss — but note this only ever reaches as far as the OS's own
// silent/Do Not Disturb setting allows; no web API can override that.
//
// Chrome for Android (and some other mobile browsers) throw "Illegal
// constructor" if `new Notification()` is called directly from a page —
// they require going through the active service worker's
// showNotification() instead. Desktop browsers support both, so this
// tries the service worker path first and only falls back to the direct
// constructor when no active registration exists. Returns whether the
// notification actually displayed, so callers (the manual test button in
// particular) don't report success when it silently failed.
async function fire(candidate) {
  const insistent = candidate.urgency >= 3 || candidate.exemptFromCap;
  const pattern = insistent ? PATTERNS.insistent : PATTERNS.gentle;
  const options = {
    body: candidate.body,
    icon: 'icons/icon-192x192.png',
    tag: candidate.key,
    renotify: true,
    silent: false,
    requireInteraction: insistent,
    vibrate: pattern,
  };
  // The notification's own `vibrate` option only ever fires if the OS
  // actually honors it for that delivery, which is inconsistent — calling
  // the Vibration API directly is the more reliable path whenever the tab
  // is open and visible, so this doesn't rely on that option alone.
  if (getState().settings.hapticsEnabled !== false) vibrate(pattern);
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (registration && registration.active) {
      await registration.showNotification(candidate.title, options);
    } else {
      // eslint-disable-next-line no-new
      new Notification(candidate.title, options);
    }
    return true;
  } catch (error) {
    console.warn('Notification failed to display:', error);
    return false;
  }
}

// Manual "Send test notification" action from Settings — fires immediately,
// ignoring quiet hours and the daily cap, so the user can confirm
// permission and the insistent behavior actually work on their device.
export async function sendTestNotification() {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  let permission = permissionState();
  if (permission === 'default') permission = await requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const shown = await fire({
    key: `test:${Date.now()}`,
    urgency: 4,
    exemptFromCap: true,
    title: 'Test notification',
    body: "If you can see and hear this, notifications are working — including the insistent style used for time-critical reminders.",
  });
  return shown ? { ok: true } : { ok: false, reason: 'failed' };
}

export function tick(referenceState = getState(), dateKey = todayKey()) {
  const state = referenceState;
  if (!state.settings.notificationsEnabled) return null;
  if (!isSupported() || Notification.permission !== 'granted') return null;
  if (isWithinQuietHours(state.settings.quietHours)) return null;

  const todayEntry = getTodayLog(state, dateKey);
  const countToday = todayEntry ? todayEntry.count : 0;
  const notifiedKeys = new Set(todayEntry ? todayEntry.notifiedKeys : []);
  const minutesNow = minutesFromHHMM(nowHHMM());

  const candidate = buildCandidates(state, dateKey, minutesNow)
    .find((c) => !notifiedKeys.has(c.key) && (c.exemptFromCap || countToday < MAX_PER_DAY));
  if (!candidate) return null;

  fire(candidate);
  recordNotification(dateKey, candidate.key);
  return candidate;
}
