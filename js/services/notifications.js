import {
  diffInDays, isWithinQuietHours, minutesFromHHMM, nowHHMM, todayKey,
} from '../core/dates.js';
import { mutate, getState } from '../core/store.js';
import { getSessionsForDate } from './scheduler.js';
import { getNeglectedSubjects } from './aiCoach.js';

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

function buildCandidates(state, dateKey, minutesNow) {
  const candidates = [];

  getSessionsForDate(state, dateKey).forEach(({ session, completed }) => {
    if (completed) return;
    const minsAway = minutesFromHHMM(session.startTime) - minutesNow;
    if (minsAway > 0 && minsAway <= 15) {
      const subject = state.subjects.find((s) => s.id === session.subjectId);
      candidates.push({
        key: `session:${session.id}:${dateKey}`,
        urgency: 3,
        title: 'Starting soon',
        body: `${subject ? `${subject.name} — ` : ''}${session.title} starts in ${minsAway} minute${minsAway === 1 ? '' : 's'}.`,
      });
    }
  });

  state.exams
    .filter((e) => diffInDays(dateKey, e.date) >= 0 && diffInDays(dateKey, e.date) <= 2)
    .forEach((exam) => {
      const daysLeft = diffInDays(dateKey, exam.date);
      candidates.push({
        key: `exam:${exam.id}:${dateKey}`,
        urgency: 3,
        title: 'Exam coming up',
        body: daysLeft === 0 ? `${exam.name} is today. Good luck!` : `${exam.name} is in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — review your weak topics.`,
      });
    });

  getNeglectedSubjects(state, 7, dateKey).slice(0, 1).forEach(({ subject }) => {
    candidates.push({
      key: `neglect:${subject.id}:${dateKey}`,
      urgency: 1,
      title: 'Time to revisit',
      body: `You haven't reviewed ${subject.name} this week. Schedule a revision session?`,
    });
  });

  return candidates.sort((a, b) => b.urgency - a.urgency);
}

function fire(title, body) {
  try {
    // eslint-disable-next-line no-new
    new Notification(title, { body, icon: 'icons/icon-192x192.png', tag: 'izatime' });
  } catch (error) {
    console.warn('Notification failed to display:', error);
  }
}

export function tick(referenceState = getState(), dateKey = todayKey()) {
  const state = referenceState;
  if (!state.settings.notificationsEnabled) return null;
  if (!isSupported() || Notification.permission !== 'granted') return null;
  if (isWithinQuietHours(state.settings.quietHours)) return null;

  const todayEntry = getTodayLog(state, dateKey);
  const countToday = todayEntry ? todayEntry.count : 0;
  if (countToday >= MAX_PER_DAY) return null;

  const notifiedKeys = new Set(todayEntry ? todayEntry.notifiedKeys : []);
  const minutesNow = minutesFromHHMM(nowHHMM());
  const candidate = buildCandidates(state, dateKey, minutesNow).find((c) => !notifiedKeys.has(c.key));
  if (!candidate) return null;

  fire(candidate.title, candidate.body);
  recordNotification(dateKey, candidate.key);
  return candidate;
}
