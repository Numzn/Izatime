import { bus } from '../core/events.js';
import {
  getState, mutate, subscribe, switchAccount, upsertKnownAccount, getCurrentAccount, getBackendUrl,
} from '../core/store.js';
import * as auth from './backendAuth.js';
import { apiFetch, ApiError } from './backendApi.js';

const PUSH_DEBOUNCE_MS = 4000;
const BACKGROUND_PULL_MS = 5 * 60 * 1000;

// Every list entity the app persists (see core/models.js defaultState()).
// Keys match the server's sync payload keys 1:1 (see
// server/src/lib/syncEntities.js) so records need no translation crossing
// the wire.
const LIST_KEYS = ['subjects', 'sessions', 'notes', 'resources', 'flashcards', 'quizzes', 'assessments', 'assignments', 'focusSessions'];
const SINGLETON_KEYS = ['settings', 'term'];

let session = null; // { user, snapshotKey }
let pushTimer = null;
let backgroundPullTimer = null;
let applyingRemote = false;
let lastSyncedAt = null;
let syncing = false;

function snapshotKeyFor(userId) {
  return `izatime:syncSnapshot:${userId}`;
}

function readSnapshot(userId) {
  try {
    const raw = localStorage.getItem(snapshotKeyFor(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeSnapshot(userId, snapshot) {
  try {
    localStorage.setItem(snapshotKeyFor(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('backendSync: failed to persist snapshot:', error);
  }
}

function emptySnapshot() {
  const byKey = {};
  LIST_KEYS.forEach((k) => { byKey[k] = {}; });
  return {
    cursor: null, byKey, settings: null, term: null,
  };
}

// Diffs current state against the last-synced snapshot to find what to
// push. No per-record dirty flags anywhere in the client's data model —
// this just serializes each record and compares it against what the
// snapshot last saw for that id, which is cheap at this app's scale (a
// personal timetable, not a multi-tenant dataset) and needs zero invasive
// changes to every model just to add change tracking.
function diffForPush(state, snapshot) {
  const changes = {};
  const deletes = {};

  LIST_KEYS.forEach((key) => {
    const prevMap = snapshot.byKey[key] || {};
    const currentIds = new Set();
    const changed = [];
    (state[key] || []).forEach((item) => {
      currentIds.add(item.id);
      const serialized = JSON.stringify(item);
      if (prevMap[item.id] !== serialized) changed.push(item);
    });
    const deletedIds = Object.keys(prevMap).filter((id) => !currentIds.has(id));
    if (changed.length) changes[key] = changed;
    if (deletedIds.length) deletes[key] = deletedIds;
  });

  SINGLETON_KEYS.forEach((key) => {
    const serialized = JSON.stringify(state[key]);
    if (snapshot[key] !== serialized) changes[key] = state[key];
  });

  return { changes, deletes };
}

function stripServerFields(record) {
  const clean = { ...record };
  delete clean.userId;
  delete clean.deletedAt;
  return clean;
}

function mergeResponseIntoState(response) {
  applyingRemote = true;
  try {
    mutate((s) => {
      LIST_KEYS.forEach((key) => {
        (response.changes[key] || []).forEach((record) => {
          const idx = s[key].findIndex((r) => r.id === record.id);
          if (record.deletedAt) {
            if (idx >= 0) s[key].splice(idx, 1);
            return;
          }
          const clean = stripServerFields(record);
          if (idx >= 0) s[key][idx] = { ...s[key][idx], ...clean };
          else s[key].push(clean);
        });
      });
      if (response.settings) Object.assign(s.settings, stripServerFields(response.settings));
      if (response.term) Object.assign(s.term, stripServerFields(response.term));
    });
  } finally {
    applyingRemote = false;
  }
}

// Rebuilds the full snapshot from the merged state (rather than patching
// just what changed this round) so the next diff always compares against
// exactly what the server currently has for every record, not just the
// ones touched in this round.
function rebuildSnapshot(cursor) {
  const state = getState();
  const byKey = {};
  LIST_KEYS.forEach((key) => {
    const map = {};
    (state[key] || []).forEach((item) => { map[item.id] = JSON.stringify(item); });
    byKey[key] = map;
  });
  return {
    cursor,
    byKey,
    settings: JSON.stringify(state.settings),
    term: JSON.stringify(state.term),
  };
}

function emitStatus(extra = {}) {
  bus.emit('backendSync:status', {
    connected: !!session,
    profile: session?.user || getCurrentAccount(),
    syncing,
    lastSyncedAt,
    ...extra,
  });
}

export function onStatusChange(handler) {
  return bus.on('backendSync:status', handler);
}

export function isConnected() {
  return !!session;
}

export function getLastSyncedAt() {
  return lastSyncedAt;
}

async function pushPull() {
  if (!session) return;
  syncing = true;
  emitStatus();
  try {
    const state = getState();
    const snapshot = readSnapshot(session.user.id) || emptySnapshot();
    const { changes, deletes } = diffForPush(state, snapshot);

    const accessToken = await auth.getAccessToken();
    const response = await apiFetch('/sync', {
      method: 'POST',
      accessToken,
      body: { cursor: snapshot.cursor, changes, deletes },
    });

    mergeResponseIntoState(response);
    writeSnapshot(session.user.id, rebuildSnapshot(response.cursor));
    lastSyncedAt = new Date().toISOString();
    syncing = false;
    emitStatus();
  } catch (error) {
    syncing = false;
    if (error instanceof ApiError && error.status === 401) {
      // Refresh token itself is dead — the user has to sign in again.
      session = null;
      emitStatus({ needsReauth: true, error: 'Session expired — sign in again to resume syncing.' });
      return;
    }
    console.warn('backendSync: sync failed:', error);
    emitStatus({ error: error.message });
  }
}

function scheduleAutoPush() {
  if (applyingRemote || !session) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushPull, PUSH_DEBOUNCE_MS);
}

subscribe(scheduleAutoPush);

function startBackgroundPull() {
  clearInterval(backgroundPullTimer);
  // Catches changes made from another device even when nothing changed
  // locally to trigger the debounced push above.
  backgroundPullTimer = setInterval(() => { if (session) pushPull(); }, BACKGROUND_PULL_MS);
}

export async function signIn() {
  if (!getBackendUrl()) throw new Error('Set a server URL in Settings first.');
  const user = await auth.signIn();
  upsertKnownAccount({
    sub: user.id, email: user.email, name: user.name, picture: user.picture,
  });
  switchAccount(user.id);
  session = { user };
  startBackgroundPull();
  await pushPull();
  return user;
}

export async function signOut() {
  clearTimeout(pushTimer);
  clearInterval(backgroundPullTimer);
  await auth.signOut();
  session = null;
  switchAccount(null);
  emitStatus();
}

export async function syncNow() {
  clearTimeout(pushTimer);
  await pushPull();
}

// Resumes an existing session (refresh token still on this device) without
// requiring the user to tap "sign in" again on every reload.
export async function resumeSession() {
  if (!auth.hasSession() || !getBackendUrl()) return null;
  try {
    const user = await auth.fetchMe();
    session = { user };
    startBackgroundPull();
    emitStatus();
    pushPull();
    return user;
  } catch (error) {
    console.warn('backendSync: could not resume session:', error);
    return null;
  }
}
