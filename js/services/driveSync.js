const FILE_NAME = 'digital-timetable-data.json';
const FILES_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

async function driveFetch(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Drive request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return response;
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
  await driveFetch(`${UPLOAD_API}/${fileId}?uploadType=media`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
