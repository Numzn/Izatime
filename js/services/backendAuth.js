import { getGoogleClientId } from '../core/store.js';
import { requestIdToken } from './googleAuth.js';
import { apiFetch, ApiError } from './backendApi.js';

const REFRESH_TOKEN_KEY = 'izatime:backendRefreshToken';
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

// The access token only ever lives in memory (never persisted) — it's
// short-lived by design, so a page reload just costs one /auth/refresh
// round trip using the refresh token, not a re-authentication with Google.
let accessToken = null;
let accessTokenExpiresAt = 0;

function readRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY) || null;
  } catch (error) {
    return null;
  }
}

function writeRefreshToken(token) {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.warn('backendAuth: failed to persist refresh token:', error);
  }
}

function setSession(data) {
  accessToken = data.accessToken;
  accessTokenExpiresAt = Date.now() + ACCESS_TOKEN_TTL_MS;
  writeRefreshToken(data.refreshToken);
}

export function hasSession() {
  return !!readRefreshToken();
}

export async function signIn() {
  const idToken = await requestIdToken(getGoogleClientId());
  const data = await apiFetch('/auth/google', { method: 'POST', body: { idToken } });
  setSession(data);
  return data.user;
}

async function refresh() {
  const refreshToken = readRefreshToken();
  if (!refreshToken) throw new ApiError('Not signed in.', 401);
  const data = await apiFetch('/auth/refresh', { method: 'POST', body: { refreshToken } });
  setSession(data);
  return accessToken;
}

// Refreshes a little before real expiry so an in-flight request never
// races the token's actual deadline.
export async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt - REFRESH_MARGIN_MS) return accessToken;
  return refresh();
}

export async function signOut() {
  const refreshToken = readRefreshToken();
  accessToken = null;
  accessTokenExpiresAt = 0;
  writeRefreshToken(null);
  if (refreshToken) {
    await apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
  }
}

export async function fetchMe() {
  const token = await getAccessToken();
  const data = await apiFetch('/auth/me', { accessToken: token });
  return data.user;
}
