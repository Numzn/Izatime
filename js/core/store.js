import { defaultState, SCHEMA_VERSION } from './models.js';
import { bus } from './events.js';
import { addDays, todayKey } from './dates.js';
import { seedTimetable } from './seedTimetable.js';

const STORAGE_KEY = 'izatime:data';
const BACKUP_KEY = 'izatime:backup';

let state = null;

function isValidState(candidate) {
  return !!candidate
    && typeof candidate === 'object'
    && Array.isArray(candidate.subjects)
    && Array.isArray(candidate.sessions)
    && typeof candidate.settings === 'object';
}

function migrate(candidate) {
  const migrated = { ...defaultState(), ...candidate };
  migrated.settings = { ...defaultState().settings, ...(candidate.settings || {}) };
  migrated.streak = candidate.streak || defaultState().streak;
  migrated.version = SCHEMA_VERSION;
  return migrated;
}

function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidState(parsed) ? parsed : null;
  } catch (error) {
    console.warn(`Store: failed reading "${key}":`, error);
    return null;
  }
}

function computeActiveDates(s) {
  const active = new Set();
  s.sessions.forEach((session) => session.completions.forEach((d) => active.add(d)));
  s.focusSessions
    .filter((f) => f.type === 'focus' && f.completed)
    .forEach((f) => active.add(f.date));
  return active;
}

function computeStreak(s) {
  const active = computeActiveDates(s);
  if (active.size === 0) return { current: 0, longest: 0, lastActiveDate: null };

  const sorted = [...active].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = addDays(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const today = todayKey();
  const yesterday = addDays(today, -1);
  let anchor = null;
  if (active.has(today)) anchor = today;
  else if (active.has(yesterday)) anchor = yesterday;

  let current = 0;
  if (anchor) {
    current = 1;
    let cursor = anchor;
    while (active.has(addDays(cursor, -1))) {
      cursor = addDays(cursor, -1);
      current += 1;
    }
  }

  return { current, longest, lastActiveDate: sorted[sorted.length - 1] };
}

function recomputeDerived(s) {
  s.streak = computeStreak(s);
  return s;
}

function persist(s) {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) localStorage.setItem(BACKUP_KEY, existing);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch (error) {
    console.error('Store: persist failed:', error);
    bus.emit('store:error', { type: 'persist-failed', error });
    return false;
  }
}

export function loadStore() {
  const primary = readKey(STORAGE_KEY);
  if (primary) {
    state = migrate(primary);
    return recomputeDerived(state);
  }

  const backup = readKey(BACKUP_KEY);
  if (backup) {
    state = migrate(backup);
    bus.emit('store:error', { type: 'recovered-from-backup' });
    recomputeDerived(state);
    persist(state);
    return state;
  }

  state = seedTimetable(defaultState());
  recomputeDerived(state);
  persist(state);
  return state;
}

export function getState() {
  if (!state) loadStore();
  return state;
}

export function mutate(fn) {
  if (!state) loadStore();
  fn(state);
  recomputeDerived(state);
  persist(state);
  bus.emit('store:change', state);
  return state;
}

export function subscribe(handler) {
  return bus.on('store:change', handler);
}

export function exportJSON() {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!isValidState(parsed)) throw new Error('That file does not look like a Digital Timetable backup.');
  state = migrate(parsed);
  recomputeDerived(state);
  persist(state);
  bus.emit('store:change', state);
  return state;
}

export function resetAll() {
  state = defaultState();
  recomputeDerived(state);
  persist(state);
  bus.emit('store:change', state);
  return state;
}
