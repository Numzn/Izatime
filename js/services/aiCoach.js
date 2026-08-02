import { createId } from '../core/id.js';
import {
  diffInDays, minutesFromHHMM, nowHHMM, todayKey,
} from '../core/dates.js';
import { createQuiz } from '../core/models.js';
import { getSessionsForDate, getNextSession } from './scheduler.js';
import { getDueFlashcards } from './spacedRepetition.js';
import { getWeakAreas } from './analytics.js';
import {
  getMostUrgentAssignment, reminderLeadDays, getUpcomingAssessments, getAssignmentsDueWithin,
} from './assignments.js';

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function subjectName(state, subjectId) {
  return state.subjects.find((s) => s.id === subjectId)?.name || 'this subject';
}

export function getLastActiveDate(state, subjectId) {
  let last = null;
  state.sessions
    .filter((s) => s.subjectId === subjectId)
    .forEach((s) => s.completions.forEach((d) => { if (!last || d > last) last = d; }));
  state.focusSessions
    .filter((f) => f.subjectId === subjectId && f.completed)
    .forEach((f) => { if (!last || f.date > last) last = f.date; });
  return last;
}

export function getNeglectedSubjects(state, thresholdDays = 5, referenceKey = todayKey()) {
  return state.subjects
    .map((subject) => {
      const last = getLastActiveDate(state, subject.id);
      const days = last ? diffInDays(last, referenceKey) : diffInDays(subject.createdAt.slice(0, 10), referenceKey);
      return { subject, daysSinceActive: days, last };
    })
    .filter((entry) => entry.daysSinceActive >= thresholdDays)
    .sort((a, b) => b.daysSinceActive - a.daysSinceActive);
}

// The Academic Planner: a deterministic rules engine over the student's own
// schedule, not a chat assistant. Every rule below answers one of the
// planner questions the app exists to answer — "what's next," "what's
// urgent," "what should I revise," "what have I neglected" — ranked by
// urgency so the most consequential one surfaces first.
export function getRecommendations(state, referenceKey = todayKey(), referenceMinutes = minutesFromHHMM(nowHHMM())) {
  const recs = [];

  // What should I prepare before my next class?
  const next = getNextSession(state, { fromDateKey: referenceKey, fromMinutes: referenceMinutes });
  if (next && next.dateKey === referenceKey) {
    const minsAway = minutesFromHHMM(next.session.startTime) - referenceMinutes;
    if (minsAway <= 20) {
      recs.push({
        id: `next-${next.session.id}`,
        urgency: 4,
        icon: 'timer',
        title: minsAway <= 0 ? `${next.session.title} is starting now` : `${next.session.title} starts in ${minsAway}m`,
        detail: subjectName(state, next.session.subjectId),
        action: { subjectId: next.session.subjectId },
      });
    }
  }

  // Which assignment is becoming urgent? Ranked by margin (days left minus
  // the effort-scaled lead time it actually needs), not just nearest date.
  const urgentAssignment = getMostUrgentAssignment(state, referenceKey);
  if (urgentAssignment) {
    const daysLeft = diffInDays(referenceKey, urgentAssignment.dueDate);
    const margin = daysLeft - reminderLeadDays(urgentAssignment);
    if (margin <= 2) {
      recs.push({
        id: `assignment-${urgentAssignment.id}`,
        urgency: margin <= 0 ? 4 : 3,
        icon: 'edit',
        title: `${urgentAssignment.title} is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        detail: subjectName(state, urgentAssignment.subjectId),
        action: { subjectId: urgentAssignment.subjectId },
      });
    }
  }

  // Which exam should I revise for today? Cross-references the nearest
  // assessment against actual flashcard mastery for that subject — this is
  // why spaced repetition stays in the product: it's the signal this
  // question needs.
  const upcomingAssessments = getUpcomingAssessments(state, 7, referenceKey);
  if (upcomingAssessments.length) {
    const assessment = upcomingAssessments[0];
    const daysLeft = diffInDays(referenceKey, assessment.date);
    const shakyCards = getDueFlashcards(state, referenceKey)
      .filter((c) => c.subjectId === assessment.subjectId).length;
    recs.push({
      id: `assessment-${assessment.id}`,
      urgency: daysLeft <= 1 ? 4 : 3,
      icon: 'help-circle',
      title: shakyCards > 0
        ? `Revise for ${assessment.name} — ${shakyCards} card${shakyCards === 1 ? '' : 's'} still shaky`
        : `${assessment.name} in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      detail: subjectName(state, assessment.subjectId),
      action: { subjectId: assessment.subjectId },
    });
  }

  // Which class have I neglected?
  const neglected = getNeglectedSubjects(state, 5, referenceKey);
  if (neglected.length) {
    const top = neglected[0];
    recs.push({
      id: `neglect-${top.subject.id}`,
      urgency: 2,
      icon: 'bell',
      title: `${top.subject.name} needs attention`,
      detail: top.last ? `Not studied in ${top.daysSinceActive} days` : 'No sessions completed yet',
      action: { subjectId: top.subject.id },
    });
  }

  // Load clustering: several things landing in the same subject this week.
  const loadBySubject = new Map();
  [...getAssignmentsDueWithin(state, 7, referenceKey).map((a) => a.subjectId),
    ...upcomingAssessments.map((a) => a.subjectId)]
    .forEach((subjectId) => loadBySubject.set(subjectId, (loadBySubject.get(subjectId) || 0) + 1));
  const clustered = [...loadBySubject.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1])[0];
  if (clustered) {
    recs.push({
      id: `cluster-${clustered[0]}`,
      urgency: 2,
      icon: 'trending-down',
      title: `${clustered[1]} things due this week in ${subjectName(state, clustered[0])}`,
      detail: 'Might be worth planning study time now rather than later.',
      action: { subjectId: clustered[0] },
    });
  }

  // Due spaced-repetition reviews, general.
  const dueCards = getDueFlashcards(state, referenceKey);
  if (dueCards.length > 0) {
    recs.push({
      id: 'due-review',
      urgency: 1,
      icon: 'layers',
      title: `${dueCards.length} review${dueCards.length === 1 ? '' : 's'} due`,
      detail: 'Spaced repetition works best when reviews happen on time.',
      action: { subjectId: dueCards[0]?.subjectId || null },
    });
  }

  getWeakAreas(state, 14, referenceKey).slice(0, 1).forEach((w) => {
    recs.push({
      id: `weak-${w.type}-${w.id}`,
      urgency: 1,
      icon: 'trending-down',
      title: `Weak area: ${w.name}`,
      detail: w.reason,
      action: { subjectId: w.type === 'subject' ? w.id : null },
    });
  });

  return recs.sort((a, b) => b.urgency - a.urgency).slice(0, 4);
}

export function generateQuiz(state, subjectId, { count = 5 } = {}) {
  const pool = state.flashcards.filter((c) => c.subjectId === subjectId);
  if (pool.length < 2) {
    return { error: 'Add at least 2 flashcards for this subject before generating a quiz.' };
  }

  const questions = shuffle(pool).slice(0, count).map((card) => {
    const others = shuffle(pool.filter((c) => c.id !== card.id).map((c) => c.back));
    const distractors = [];
    others.forEach((back) => { if (distractors.length < 3 && !distractors.includes(back)) distractors.push(back); });
    while (distractors.length < 3) distractors.push('None of the above');

    const options = shuffle([card.back, ...distractors]);
    return {
      id: createId(),
      question: card.front,
      options,
      answerIndex: options.indexOf(card.back),
      explanation: card.back,
    };
  });

  const subject = state.subjects.find((s) => s.id === subjectId);
  return createQuiz({
    subjectId,
    title: `${subject ? subject.name : 'Quiz'} check`,
    questions,
    source: 'generated',
  });
}
