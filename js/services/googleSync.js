import { bus } from '../core/events.js';
import {
  getState, getGoogleClientId, switchAccount, subscribe, upsertKnownAccount, getCurrentAccount, importJSON,
} from '../core/store.js';
import { requestAccessToken, fetchProfile, revokeToken } from './googleAuth.js';
import { findOrCreateAppFile, readAppFile, writeAppFile } from './driveSync.js';

const PUSH_DEBOUNCE_MS = 4000;
const TOKEN_REFRESH_MARGIN_MS = 60000;

let session = null; // { accessToken, expiresAt, fileId, profile }
let unsubscribeStore = null;
let pushTimer = null;

function emitStatus(extra = {}) {
  bus.emit('sync:status', {
    connected: !!session,
    profile: session?.profile || getCurrentAccount(),
    syncing: false,
    lastSyncedAt: session?.lastSyncedAt || null,
    ...extra,
  });
}

export function onStatusChange(handler) {
  return bus.on('sync:status', handler);
}

export function isConnected() {
  return !!session;
}

export function getLastSyncedAt() {
  return session?.lastSyncedAt || null;
}

async function ensureFreshToken() {
  if (!session) throw new Error('Not signed in.');
  if (Date.now() < session.expiresAt - TOKEN_REFRESH_MARGIN_MS) return session.accessToken;

  const clientId = getGoogleClientId();
  const token = await requestAccessToken(clientId, { selectAccount: false });
  session.accessToken = token.accessToken;
  session.expiresAt = token.expiresAt;
  return session.accessToken;
}

async function pushNow() {
  if (!session) return;
  try {
    emitStatus({ syncing: true });
    const accessToken = await ensureFreshToken();
    await writeAppFile(accessToken, session.fileId, getState());
    session.lastSyncedAt = new Date().toISOString();
    emitStatus({ syncing: false });
  } catch (error) {
    console.warn('Sync: push failed:', error);
    emitStatus({ syncing: false, error: error.message });
  }
}

function scheduleAutoPush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, PUSH_DEBOUNCE_MS);
}

export async function signIn({ selectAccount = false } = {}) {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('Add a Google OAuth Client ID in Settings first.');

  if (session) {
    // Switching straight from one signed-in account to another: drop the
    // previous session cleanly instead of leaving its token dangling.
    clearTimeout(pushTimer);
    revokeToken(session.accessToken);
    session = null;
  }

  const token = await requestAccessToken(clientId, { selectAccount });
  const profile = await fetchProfile(token.accessToken);
  upsertKnownAccount(profile);
  switchAccount(profile.sub);

  const file = await findOrCreateAppFile(token.accessToken);
  const remote = await readAppFile(token.accessToken, file.id);

  session = {
    accessToken: token.accessToken, expiresAt: token.expiresAt, fileId: file.id, profile, lastSyncedAt: null,
  };

  if (remote && (remote.subjects?.length || remote.sessions?.length)) {
    importJSON(JSON.stringify(remote));
  } else {
    await writeAppFile(token.accessToken, file.id, getState());
  }

  session.lastSyncedAt = new Date().toISOString();
  unsubscribeStore = subscribe(scheduleAutoPush);
  emitStatus({ syncing: false });
  return profile;
}

export function signOut() {
  clearTimeout(pushTimer);
  if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null; }
  if (session) revokeToken(session.accessToken);
  session = null;
  switchAccount(null);
  emitStatus({ syncing: false });
}

export async function syncNow() {
  clearTimeout(pushTimer);
  await pushNow();
}
