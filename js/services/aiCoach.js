import { createId } from '../core/id.js';
import {
  addDays, diffInDays, minutesFromHHMM, nowHHMM, todayKey,
} from '../core/dates.js';
import { createQuiz } from '../core/models.js';
import { getSessionsForDate, getNextSession } from './scheduler.js';
import { getDueFlashcards, getDueTopics, masteryLabel } from './spacedRepetition.js';
import { getWeakAreas } from './analytics.js';

const STRATEGY_TIPS = [
  'Use active recall: close your notes and try to explain the topic out loud before checking.',
  'Chunk the session into 25-minute focus blocks with 5-minute breaks.',
  'Teach it back — explaining a topic simply (Feynman technique) exposes gaps fast.',
  'Interleave two related topics in one session instead of drilling one for too long.',
  'Revisit yesterday\'s hardest topic for 5 minutes before starting something new.',
];

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

export function getRecommendations(state, referenceKey = todayKey(), referenceMinutes = minutesFromHHMM(nowHHMM())) {
  const recs = [];

  const next = getNextSession(state, { fromDateKey: referenceKey, fromMinutes: referenceMinutes });
  if (next && next.dateKey === referenceKey) {
    const minsAway = minutesFromHHMM(next.session.startTime) - referenceMinutes;
    if (minsAway <= 20) {
      recs.push({
        id: `next-${next.session.id}`,
        urgency: 3,
        icon: 'timer',
        title: minsAway <= 0 ? `${next.session.title} is starting now` : `${next.session.title} starts in ${minsAway}m`,
        detail: subjectName(state, next.session.subjectId),
        action: { type: 'go-focus', subjectId: next.session.subjectId, sessionId: next.session.id },
      });
    }
  }

  const dueCards = getDueFlashcards(state, referenceKey);
  const dueTopics = getDueTopics(state, referenceKey);
  if (dueCards.length + dueTopics.length > 0) {
    recs.push({
      id: 'due-review',
      urgency: 2,
      icon: 'layers',
      title: `${dueCards.length + dueTopics.length} review${dueCards.length + dueTopics.length === 1 ? '' : 's'} due`,
      detail: 'Spaced repetition works best when reviews happen on time.',
      action: { type: 'go-hub' },
    });
  }

  const neglected = getNeglectedSubjects(state, 5, referenceKey);
  if (neglected.length) {
    const top = neglected[0];
    recs.push({
      id: `neglect-${top.subject.id}`,
      urgency: 2,
      icon: 'bell',
      title: `${top.subject.name} needs attention`,
      detail: top.last
        ? `Not studied in ${top.daysSinceActive} days`
        : 'No sessions completed yet',
      action: { type: 'go-planner', subjectId: top.subject.id },
    });
  }

  const upcomingExams = state.assessments
    .filter((e) => diffInDays(referenceKey, e.date) >= 0 && diffInDays(referenceKey, e.date) <= 7)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcomingExams.length) {
    const exam = upcomingExams[0];
    const daysLeft = diffInDays(referenceKey, exam.date);
    recs.push({
      id: `exam-${exam.id}`,
      urgency: 3,
      icon: 'file-text',
      title: `${exam.name} in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      detail: subjectName(state, exam.subjectId),
      action: { type: 'go-planner', subjectId: exam.subjectId },
    });
  }

  getWeakAreas(state, 14, referenceKey).slice(0, 1).forEach((w) => {
    recs.push({
      id: `weak-${w.type}-${w.id}`,
      urgency: 1,
      icon: 'trending-down',
      title: `Weak area: ${w.name}`,
      detail: w.reason,
      action: w.type === 'subject' ? { type: 'go-planner', subjectId: w.id } : { type: 'go-hub' },
    });
  });

  return recs.sort((a, b) => b.urgency - a.urgency).slice(0, 4);
}

export function getDailyTip(state, referenceKey = todayKey()) {
  const today = getSessionsForDate(state, referenceKey);
  const done = today.filter((e) => e.completed).length;

  if (today.length && done === today.length) {
    return 'Everything for today is done. A short active-recall pass tonight will lock it in.';
  }
  if (today.length && done === 0) {
    const top = [...today].sort((a, b) => b.session.priority - a.session.priority)[0];
    return `Start with ${top.session.title} — it's today's top priority.`;
  }

  const dueCount = getDueFlashcards(state, referenceKey).length + getDueTopics(state, referenceKey).length;
  if (dueCount > 0) {
    return `${dueCount} review${dueCount === 1 ? '' : 's'} due — a quick pass now beats a long one later.`;
  }

  const dayIndex = Math.floor(new Date().getTime() / 86400000) % STRATEGY_TIPS.length;
  return STRATEGY_TIPS[dayIndex];
}

export function getStudyStrategy(topic) {
  const label = masteryLabel(topic.srs);
  if (label === 'new') {
    return `${topic.name} is new. Start with flashcards or a summary note, then attempt active recall before your next review.`;
  }
  if (label === 'learning') {
    return `${topic.name} is progressing (review interval: ${topic.srs.interval} day${topic.srs.interval === 1 ? '' : 's'}). Keep reviewing on schedule rather than cramming.`;
  }
  return `${topic.name} is well retained. A light monthly review is enough — spend fresh time on newer topics.`;
}

export function generateQuiz(state, subjectId, { topicId = null, count = 5 } = {}) {
  const pool = state.flashcards.filter((c) => c.subjectId === subjectId && (!topicId || c.topicId === topicId));
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
    topicId,
    title: `${subject ? subject.name : 'Quiz'} check`,
    questions,
    source: 'generated',
  });
}
