import { defaultState, SCHEMA_VERSION } from './models.js';
import { bus } from './events.js';
import { addDays, todayKey } from './dates.js';
import { seedTimetable } from './seedTimetable.js';

const LEGACY_DATA_KEY = 'izatime:data';
const LEGACY_BACKUP_KEY = 'izatime:backup';
const SESSION_KEY = 'izatime:session';
const ACCOUNTS_KEY = 'izatime:accounts';
const CONFIG_KEY = 'izatime:config';

// Ships with a working Client ID out of the box. Overridable in Settings
// for anyone forking this app to their own Google Cloud project — the ID
// is a public identifier (not a secret), safe to embed client-side; the
// real access control is the "Authorized JavaScript origins" list
// configured for it in Google Cloud Console.
const DEFAULT_GOOGLE_CLIENT_ID = '901733894811-0ra0kkai03vb0rfbuvdgnci8e4n6roj2.apps.googleusercontent.com';

let state = null;
let currentSub = null;

function dataKeyFor(sub) {
  return sub ? `izatime:data:${sub}` : 'izatime:data:local';
}

function backupKeyFor(sub) {
  return sub ? `izatime:backup:${sub}` : 'izatime:backup:local';
}

// One-time upgrade: earlier versions of this app stored everything under a
// single unscoped key. Adopt that as the "local" (signed-out) account so
// existing users don't lose data when multi-account support ships.
function migrateLegacyLocalData() {
  try {
    const legacyData = localStorage.getItem(LEGACY_DATA_KEY);
    if (legacyData && !localStorage.getItem(dataKeyFor(null))) {
      localStorage.setItem(dataKeyFor(null), legacyData);
      const legacyBackup = localStorage.getItem(LEGACY_BACKUP_KEY);
      if (legacyBackup) localStorage.setItem(backupKeyFor(null), legacyBackup);
    }
  } catch (error) {
    console.warn('Store: legacy migration failed:', error);
  }
}

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

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : { activeSub: null };
  } catch (error) {
    return { activeSub: null };
  }
}

function writeSession(sub) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ activeSub: sub }));
  } catch (error) {
    console.warn('Store: failed to save session:', error);
  }
}

function readAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeAccounts(list) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch (error) {
    console.warn('Store: failed to save account list:', error);
  }
}

export function getKnownAccounts() {
  return readAccounts().sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
}

export function upsertKnownAccount(profile) {
  const list = readAccounts().filter((a) => a.sub !== profile.sub);
  list.push({ ...profile, lastUsedAt: new Date().toISOString() });
  writeAccounts(list);
}

export function forgetAccount(sub) {
  writeAccounts(readAccounts().filter((a) => a.sub !== sub));
  try {
    localStorage.removeItem(dataKeyFor(sub));
    localStorage.removeItem(backupKeyFor(sub));
  } catch (error) {
    console.warn('Store: failed to clear account data:', error);
  }
}

export function getCurrentAccount() {
  if (!currentSub) return null;
  return readAccounts().find((a) => a.sub === currentSub) || { sub: currentSub };
}

// Device-level config (not per-account data): the Google OAuth Client ID
// must be known before any account is chosen, and stays the same across
// every account signed into on this device.
function readConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('Store: failed to save device config:', error);
  }
}

export function getGoogleClientId() {
  return readConfig().googleClientId || DEFAULT_GOOGLE_CLIENT_ID;
}

export function isDefaultGoogleClientId() {
  return !readConfig().googleClientId;
}

export function setGoogleClientId(clientId) {
  writeConfig({ ...readConfig(), googleClientId: clientId });
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
    const dataKey = dataKeyFor(currentSub);
    const backupKey = backupKeyFor(currentSub);
    const existing = localStorage.getItem(dataKey);
    if (existing) localStorage.setItem(backupKey, existing);
    localStorage.setItem(dataKey, JSON.stringify(s));
    return true;
  } catch (error) {
    console.error('Store: persist failed:', error);
    bus.emit('store:error', { type: 'persist-failed', error });
    return false;
  }
}

function loadAccountState(sub) {
  const primary = readKey(dataKeyFor(sub));
  if (primary) {
    currentSub = sub;
    state = migrate(primary);
    return recomputeDerived(state);
  }

  const backup = readKey(backupKeyFor(sub));
  if (backup) {
    currentSub = sub;
    state = migrate(backup);
    bus.emit('store:error', { type: 'recovered-from-backup' });
    recomputeDerived(state);
    persist(state);
    return state;
  }

  // Only the local/signed-out bucket gets the sample timetable — a fresh
  // Google account should start empty, not inherit someone else's schedule.
  currentSub = sub;
  state = sub ? defaultState() : seedTimetable(defaultState());
  recomputeDerived(state);
  persist(state);
  return state;
}

export function loadStore() {
  migrateLegacyLocalData();
  const session = readSession();
  return loadAccountState(session.activeSub || null);
}

export function switchAccount(sub) {
  const result = loadAccountState(sub);
  writeSession(sub);
  bus.emit('store:change', state);
  bus.emit('account:change', getCurrentAccount());
  return result;
}

export function getState() {
  if (!state) loadStore();
  return state;
}

export function mutate(fn) {
  if (!state) loadStore();
  fn(state);
  state.updatedAt = new Date().toISOString();
  recomputeDerived(state);
  persist(state);
  bus.emit('store:change', state);
  return state;
}

export function subscribe(handler) {
  return bus.on('store:change', handler);
}

export function onAccountChange(handler) {
  return bus.on('account:change', handler);
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
