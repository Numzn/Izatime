const FILE_NAME = 'digital-timetable-data.json';
const FILES_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const ABOUT_API = 'https://www.googleapis.com/drive/v3/about';

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries transient failures (network errors, 429 rate limiting, 5xx) with
// exponential backoff. Never retries 401/403/404/etc — those need the
// caller to re-authenticate or fix the request, not try again.
async function driveFetch(url, accessToken, options = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
      });
    } catch (networkError) {
      if (attempt === MAX_ATTEMPTS) throw new Error('Could not reach Google Drive. Check your connection.');
      // eslint-disable-next-line no-await-in-loop
      await wait(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) return response;

    if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) {
      // eslint-disable-next-line no-await-in-loop
      const body = await response.text().catch(() => '');
      const error = new Error(`Drive request failed (${response.status}): ${body.slice(0, 200)}`);
      error.status = response.status;
      throw error;
    }

    // eslint-disable-next-line no-await-in-loop
    await wait(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }
  throw new Error('Drive request failed after retries.');
}

// Identity, without an identity scope: `about.get` is part of the Drive
// API surface and is accessible under drive.appdata alone, so we can show
// who's signed in without ever requesting userinfo.email/profile. The
// stable per-account key is Drive's own `permissionId` (there is no OIDC
// `sub` available at this scope level).
export async function fetchAccountInfo(accessToken) {
  const response = await driveFetch(`${ABOUT_API}?fields=user`, accessToken);
  const data = await response.json();
  const user = data.user || {};
  return {
    sub: user.permissionId || 'unknown',
    email: user.emailAddress || '',
    name: user.displayName || user.emailAddress || 'Google account',
    picture: user.photoLink || '',
  };
}

export async function findAppFile(accessToken) {
  const url = `${FILES_API}?spaces=appDataFolder&q=${encodeURIComponent(`name='${FILE_NAME}'`)}&fields=files(id,modifiedTime)`;
  const response = await driveFetch(url, accessToken);
  const data = await response.json();
  return data.files?.[0] || null;
}

export async function createAppFile(accessToken) {
  const response = await driveFetch(FILES_API, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }),
  });
  const data = await response.json();
  return { id: data.id, modifiedTime: null };
}

export async function findOrCreateAppFile(accessToken) {
  const existing = await findAppFile(accessToken);
  return existing || createAppFile(accessToken);
}

export async function getFileMetadata(accessToken, fileId) {
  const response = await driveFetch(`${FILES_API}/${fileId}?fields=modifiedTime`, accessToken);
  return response.json();
}

export async function readAppFile(accessToken, fileId) {
  const response = await driveFetch(`${FILES_API}/${fileId}?alt=media`, accessToken);
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('Drive: stored file was not valid JSON:', error);
    return null;
  }
}

export async function writeAppFile(accessToken, fileId, data) {
  const response = await driveFetch(`${UPLOAD_API}/${fileId}?uploadType=media&fields=modifiedTime`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}
