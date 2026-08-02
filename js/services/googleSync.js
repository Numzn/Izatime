import { bus } from '../core/events.js';
import {
  getState, getGoogleClientId, switchAccount, subscribe, upsertKnownAccount, getCurrentAccount, importJSON,
} from '../core/store.js';
import { requestAccessToken, revokeToken } from './googleAuth.js';
import {
  findOrCreateAppFile, readAppFile, writeAppFile, fetchAccountInfo, getFileMetadata,
} from './driveSync.js';

const PUSH_DEBOUNCE_MS = 4000;
const TOKEN_REFRESH_MARGIN_MS = 60000;

// session: { accessToken, expiresAt, fileId, profile, lastSyncedAt,
//   lastKnownRemoteModified } — the last Drive `modifiedTime` we know
// about, used to detect whether another device has synced more recently
// than us since our last sync (see pushNow()).
let session = null;
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

    // Conflict check: has the remote file changed since we last knew about
    // it (i.e. another device synced in the meantime)? If so, that version
    // is newer than whatever we last pulled — newest wins, so pull it
    // instead of clobbering it with our local copy.
    if (session.lastKnownRemoteModified) {
      const meta = await getFileMetadata(accessToken, session.fileId);
      if (meta.modifiedTime > session.lastKnownRemoteModified) {
        const remote = await readAppFile(accessToken, session.fileId);
        if (remote) {
          importJSON(JSON.stringify(remote));
          session.lastKnownRemoteModified = meta.modifiedTime;
          session.lastSyncedAt = new Date().toISOString();
          emitStatus({ syncing: false, conflictResolved: true });
          return;
        }
      }
    }

    const written = await writeAppFile(accessToken, session.fileId, getState());
    session.lastKnownRemoteModified = written.modifiedTime;
    session.lastSyncedAt = new Date().toISOString();
    emitStatus({ syncing: false });
  } catch (error) {
    console.warn('Sync: push failed:', error);
    // A 401 means the access token was rejected outright (revoked/expired
    // beyond what a silent refresh could fix) — no amount of retrying the
    // request helps; the user has to sign in again.
    if (error.status === 401) {
      clearTimeout(pushTimer);
      if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null; }
      session = null;
      emitStatus({ syncing: false, needsReauth: true, error: 'Session expired — sign in again to resume syncing.' });
      return;
    }
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
  const profile = await fetchAccountInfo(token.accessToken);
  upsertKnownAccount(profile);
  switchAccount(profile.sub);

  const file = await findOrCreateAppFile(token.accessToken);
  const remote = await readAppFile(token.accessToken, file.id);
  const remoteHasData = !!(remote && (remote.subjects?.length || remote.sessions?.length));

  session = {
    accessToken: token.accessToken, expiresAt: token.expiresAt, fileId: file.id, profile, lastSyncedAt: null, lastKnownRemoteModified: file.modifiedTime || null,
  };

  // Conflict detection, newest wins: prefer whichever side's own updatedAt
  // is more recent. Drive's modifiedTime is the fallback for older/foreign
  // files that predate the updatedAt field.
  const localUpdatedAt = getState().updatedAt || null;
  const remoteUpdatedAt = remote?.updatedAt || file.modifiedTime || null;
  const remoteIsNewer = remoteHasData && (!localUpdatedAt || (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt));

  if (remoteIsNewer) {
    importJSON(JSON.stringify(remote));
  } else {
    const written = await writeAppFile(token.accessToken, file.id, getState());
    session.lastKnownRemoteModified = written.modifiedTime;
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
