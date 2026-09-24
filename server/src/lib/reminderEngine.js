// Server-side port of js/services/scheduler.js's occursOn/getSessionsForDate
// and js/services/notifications.js's candidate builders. Kept behaviorally
// identical to the client versions (same tiers, same dedup keys, same
// MAX_PER_DAY cap) so a reminder reads the same whether it was ever fired
// client-side (before this backend existed) or by this scheduler — the
// dedup key format is unchanged, so there's no double-fire during the
// transition.
import {
  addDays, dayCodeOf, diffInDays, minutesFromHHMM,
} from './dates.js';

const MAX_PER_DAY = 3;

export function occursOn(session, dateKey) {
  if (session.recurrence) {
    const { days, until } = session.recurrence;
    if (!days.includes(dayCodeOf(dateKey))) return false;
    if (dateKey < session.date) return false;
    if (until && dateKey > until) return false;
    return true;
  }
  return session.date === dateKey;
}

export function isCompletedOn(session, dateKey) {
  return Array.isArray(session.completions) && session.completions.includes(dateKey);
}

function getSessionsForDate(sessions, dateKey) {
  return sessions
    .filter((s) => !s.deletedAt && occursOn(s, dateKey))
    .map((s) => ({ session: s, completed: isCompletedOn(s, dateKey) }));
}

function isAssignmentDone(assignment) {
  return assignment.status === 'submitted' || assignment.status === 'graded';
}

function reminderLeadDays(assignment) {
  const hours = (assignment.estimatedMinutes || 60) / 60;
  return Math.min(14, Math.max(1, Math.round(hours)));
}

function subjectLabel(subjectsById, subjectId, title) {
  const subject = subjectsById.get(subjectId);
  return subject ? `${subject.name} — ${title}` : title;
}

function getLastActiveDate(sessions, focusSessions, subjectId) {
  let last = null;
  sessions.filter((s) => s.subjectId === subjectId && !s.deletedAt)
    .forEach((s) => (s.completions || []).forEach((d) => { if (!last || d > last) last = d; }));
  focusSessions.filter((f) => f.subjectId === subjectId && f.completed && !f.deletedAt)
    .forEach((f) => { if (!last || f.date > last) last = f.date; });
  return last;
}

function classCandidates(data, dateKey, minutesNow) {
  const { sessions, subjectsById } = data;
  const candidates = [];
  const tomorrowKey = addDays(dateKey, 1);

  getSessionsForDate(sessions, tomorrowKey).forEach(({ session, completed }) => {
    if (completed) return;
    candidates.push({
      key: `session:${session.id}:${tomorrowKey}:1day`,
      urgency: 2,
      title: 'Tomorrow',
      body: `${subjectLabel(subjectsById, session.subjectId, session.title)} is tomorrow at ${session.startTime}.`,
    });
  });

  getSessionsForDate(sessions, dateKey).forEach(({ session, completed }) => {
    if (completed) return;
    const minsAway = minutesFromHHMM(session.startTime) - minutesNow;
    const label = subjectLabel(subjectsById, session.subjectId, session.title);
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

function assignmentCandidates(data, dateKey) {
  const { assignments, subjectsById } = data;
  return assignments
    .filter((a) => !a.deletedAt && !isAssignmentDone(a))
    .map((a) => {
      const daysLeft = diffInDays(dateKey, a.dueDate);
      if (daysLeft < 0 || daysLeft > 14) return null;
      const lead = reminderLeadDays(a);
      let tier = null;
      if (daysLeft === 0) tier = 'dueday';
      else if (daysLeft === 1) tier = '1day';
      else if (daysLeft === 3) tier = '3day';
      else if (daysLeft === lead && lead > 3) tier = 'lead';
      if (!tier) return null;
      const label = subjectLabel(subjectsById, a.subjectId, a.title);
      return {
        key: `assignment:${a.id}:${dateKey}:${tier}`,
        urgency: daysLeft <= 1 ? 4 : 2,
        title: daysLeft === 0 ? 'Due today' : 'Assignment due soon',
        body: daysLeft === 0 ? `${label} is due today.` : `${label} is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
      };
    })
    .filter(Boolean);
}

function assessmentCandidates(data, dateKey) {
  const { assessments, subjectsById } = data;
  return assessments
    .filter((a) => !a.deletedAt)
    .map((a) => {
      const daysLeft = diffInDays(dateKey, a.date);
      if (![7, 3, 1, 0].includes(daysLeft)) return null;
      const label = subjectLabel(subjectsById, a.subjectId, a.name);
      return {
        key: `assessment:${a.id}:${dateKey}:${daysLeft}`,
        urgency: daysLeft <= 1 ? 4 : 2,
        title: daysLeft === 0 ? 'Today' : 'Assessment coming up',
        body: daysLeft === 0 ? `${label} is today. Good luck!` : `${label} is in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
      };
    })
    .filter(Boolean);
}

function neglectedCandidates(data, dateKey) {
  const {
    subjects, sessions, focusSessions, thresholdDays = 7,
  } = data;
  const entries = subjects
    .filter((s) => !s.deletedAt)
    .map((subject) => {
      const last = getLastActiveDate(sessions, focusSessions, subject.id);
      const days = last ? diffInDays(last, dateKey) : diffInDays(subject.createdAt.toISOString().slice(0, 10), dateKey);
      return { subject, daysSinceActive: days };
    })
    .filter((entry) => entry.daysSinceActive >= thresholdDays)
    .sort((a, b) => b.daysSinceActive - a.daysSinceActive);

  if (!entries.length) return [];
  const top = entries[0];
  return [{
    key: `neglect:${top.subject.id}:${dateKey}`,
    urgency: 1,
    title: 'Time to revisit',
    body: `You haven't reviewed ${top.subject.name} this week. Schedule a revision session?`,
  }];
}

function buildCandidates(data, dateKey, minutesNow, notifyCategories) {
  const categories = notifyCategories || {};
  const candidates = [];
  if (categories.classes !== false) candidates.push(...classCandidates(data, dateKey, minutesNow));
  if (categories.assignments !== false) candidates.push(...assignmentCandidates(data, dateKey));
  if (categories.assessments !== false) candidates.push(...assessmentCandidates(data, dateKey));
  if (categories.neglected !== false) candidates.push(...neglectedCandidates(data, dateKey));
  return candidates.sort((a, b) => b.urgency - a.urgency);
}

// Mirrors notifications.js's tick(): picks at most one new candidate per
// call, respecting the same daily cap and per-key dedup. `notifiedKeysToday`
// is the set of keys already delivered today (from NotificationLogEntry);
// `countToday` is how many of those counted against the cap (the 10-minute
// class tier is exempt, same as client-side).
export function pickCandidate({
  subjects, sessions, assignments, assessments, focusSessions, notifyCategories,
}, dateKey, minutesNow, notifiedKeysToday, countToday) {
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const data = {
    subjects, sessions, assignments, assessments, focusSessions, subjectsById,
  };
  const candidates = buildCandidates(data, dateKey, minutesNow, notifyCategories);
  return candidates.find((c) => !notifiedKeysToday.has(c.key) && (c.exemptFromCap || countToday < MAX_PER_DAY)) || null;
}

export { MAX_PER_DAY };
