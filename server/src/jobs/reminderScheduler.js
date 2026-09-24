import { prisma } from '../lib/prisma.js';
import { sendPush } from '../lib/webPush.js';
import { isWithinQuietHours, minutesFromHHMM, nowHHMMInTz, todayKeyInTz } from '../lib/dates.js';
import { pickCandidate } from '../lib/reminderEngine.js';

const TICK_INTERVAL_MS = 60 * 1000;

async function deliverToUser(user) {
  const { settings } = user;
  const dateKey = todayKeyInTz(settings.timezone);
  const hhmm = nowHHMMInTz(settings.timezone);
  if (isWithinQuietHours(settings.quietHours, hhmm)) return;

  const [subjects, sessions, assignments, assessments, focusSessions, todayLog] = await Promise.all([
    prisma.subject.findMany({ where: { userId: user.id, deletedAt: null } }),
    prisma.classSession.findMany({ where: { userId: user.id, deletedAt: null } }),
    prisma.assignment.findMany({ where: { userId: user.id, deletedAt: null } }),
    prisma.assessment.findMany({ where: { userId: user.id, deletedAt: null } }),
    prisma.focusSession.findMany({ where: { userId: user.id, deletedAt: null } }),
    prisma.notificationLogEntry.findMany({ where: { userId: user.id, date: dateKey } }),
  ]);

  const candidate = pickCandidate(
    {
      subjects, sessions, assignments, assessments, focusSessions, notifyCategories: settings.notifyCategories,
    },
    dateKey,
    minutesFromHHMM(hhmm),
    new Set(todayLog.map((e) => e.key)),
    todayLog.length,
  );
  if (!candidate) return;

  const results = await Promise.all(
    user.pushSubscriptions.map((sub) => sendPush(sub, { title: candidate.title, body: candidate.body, tag: candidate.key })),
  );

  const goneEndpoints = user.pushSubscriptions
    .filter((_, i) => results[i].gone)
    .map((s) => s.endpoint);
  if (goneEndpoints.length) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: goneEndpoints } } });
  }

  // Best-effort: if two ticks somehow overlapped for the same user the
  // unique(userId, key) constraint turns the loser into a harmless no-op.
  await prisma.notificationLogEntry.create({ data: { userId: user.id, date: dateKey, key: candidate.key } }).catch(() => {});
}

async function tick() {
  const users = await prisma.user.findMany({
    where: { settings: { notificationsEnabled: true }, pushSubscriptions: { some: {} } },
    include: { settings: true, pushSubscriptions: true },
  });

  await Promise.all(users.map((user) => deliverToUser(user).catch((error) => {
    console.error(`Reminder scheduler failed for user ${user.id}:`, error);
  })));
}

let handle = null;

export function startReminderScheduler() {
  if (handle) return;
  handle = setInterval(() => { tick().catch((error) => console.error('Reminder scheduler tick failed:', error)); }, TICK_INTERVAL_MS);
  // Also run once shortly after boot rather than waiting a full interval.
  setTimeout(() => { tick().catch((error) => console.error('Reminder scheduler tick failed:', error)); }, 5000);
}

export function stopReminderScheduler() {
  clearInterval(handle);
  handle = null;
}
