import { addDays, todayKey } from '../core/dates.js';

const QUALITY = { again: 1, hard: 3, good: 4, easy: 5 };

export function review(srs, ratingKey, referenceDateKey = todayKey()) {
  const q = QUALITY[ratingKey] ?? QUALITY.good;

  let { repetitions, interval, easeFactor } = srs;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * easeFactor);
  }

  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  srs.repetitions = repetitions;
  srs.interval = interval;
  srs.easeFactor = Math.round(easeFactor * 100) / 100;
  srs.lastReviewedAt = referenceDateKey;
  srs.nextReviewAt = addDays(referenceDateKey, interval);
  return srs;
}

export function isDue(srs, referenceDateKey = todayKey()) {
  return srs.nextReviewAt <= referenceDateKey;
}

export function getDueFlashcards(state, referenceDateKey = todayKey()) {
  return state.flashcards.filter((card) => isDue(card.srs, referenceDateKey));
}

export function masteryLabel(srs) {
  if (srs.repetitions === 0) return 'new';
  if (srs.interval < 7) return 'learning';
  return 'mastered';
}
