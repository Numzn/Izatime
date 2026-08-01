import { lastNDays, todayKey } from '../core/dates.js';
import { getSessionsForDate } from './scheduler.js';
import { masteryLabel } from './spacedRepetition.js';

export function getFocusMinutesForDate(state, dateKey) {
  return state.focusSessions
    .filter((f) => f.date === dateKey && f.type === 'focus' && f.completed)
    .reduce((sum, f) => sum + f.actualMinutes, 0);
}

export function getScheduledMinutesForDate(state, dateKey) {
  return getSessionsForDate(state, dateKey)
    .filter((e) => e.completed)
    .reduce((sum, e) => sum + e.session.durationMinutes, 0);
}

export function getStudyMinutesForDate(state, dateKey) {
  return getFocusMinutesForDate(state, dateKey) + getScheduledMinutesForDate(state, dateKey);
}

export function getDailyGoalProgress(state, dateKey = todayKey()) {
  const minutes = getStudyMinutesForDate(state, dateKey);
  const goal = state.settings.dailyGoalMinutes || 60;
  return { minutes, goal, pct: Math.min(100, Math.round((minutes / goal) * 100)) };
}

export function getTrend(state, days = 7, referenceKey = todayKey()) {
  return lastNDays(days, referenceKey).map((dateKey) => ({
    dateKey,
    minutes: getStudyMinutesForDate(state, dateKey),
  }));
}

export function getCompletionRate(state, days = 14, referenceKey = todayKey()) {
  let total = 0;
  let done = 0;
  lastNDays(days, referenceKey).forEach((dateKey) => {
    const entries = getSessionsForDate(state, dateKey);
    total += entries.length;
    done += entries.filter((e) => e.completed).length;
  });
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function getSubjectPerformance(state, days = 14, referenceKey = todayKey()) {
  const window = lastNDays(days, referenceKey);

  return state.subjects.map((subject) => {
    let total = 0;
    let done = 0;
    window.forEach((dateKey) => {
      const entries = getSessionsForDate(state, dateKey).filter((e) => e.session.subjectId === subject.id);
      total += entries.length;
      done += entries.filter((e) => e.completed).length;
    });

    const topics = state.topics.filter((t) => t.subjectId === subject.id);
    const mastered = topics.filter((t) => masteryLabel(t.srs) === 'mastered').length;

    const quizzes = state.quizzes.filter((q) => q.subjectId === subject.id);
    const allAttempts = quizzes.flatMap((q) => q.attempts);
    const avgScore = allAttempts.length
      ? Math.round((allAttempts.reduce((sum, a) => sum + (a.score / a.total), 0) / allAttempts.length) * 100)
      : null;

    return {
      subject,
      sessionsTotal: total,
      sessionsDone: done,
      completionPct: total ? Math.round((done / total) * 100) : null,
      topicsTotal: topics.length,
      topicsMastered: mastered,
      avgQuizScore: avgScore,
    };
  });
}

export function getWeakAreas(state, days = 14, referenceKey = todayKey()) {
  const performance = getSubjectPerformance(state, days, referenceKey);
  const weak = [];

  performance.forEach((p) => {
    if (p.sessionsTotal >= 2 && p.completionPct !== null && p.completionPct < 50) {
      weak.push({
        type: 'subject', id: p.subject.id, name: p.subject.name,
        reason: `Only ${p.completionPct}% of ${p.subject.name} sessions completed in the last ${days} days`,
      });
    }
    if (p.avgQuizScore !== null && p.avgQuizScore < 60) {
      weak.push({
        type: 'subject', id: p.subject.id, name: p.subject.name,
        reason: `Quiz average in ${p.subject.name} is ${p.avgQuizScore}%`,
      });
    }
  });

  state.topics
    .filter((t) => t.srs.repetitions > 0 && t.srs.easeFactor < 2.0)
    .forEach((t) => {
      const subject = state.subjects.find((s) => s.id === t.subjectId);
      weak.push({
        type: 'topic', id: t.id, name: t.name,
        reason: `${t.name}${subject ? ` (${subject.name})` : ''} keeps coming up hard in review`,
      });
    });

  return weak.slice(0, 6);
}
