const GIS_SRC = 'https://accounts.google.com/gsi/client';
// Minimal-scope by design: drive.appdata is enough both to read/write our
// hidden sync file AND (via Drive's own `about.get`) to read the signed-in
// user's name/email/photo — no separate identity scope needed, and this
// app never sees or touches anything else in the user's Drive.
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let gisLoadPromise = null;

function loadGisScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Google Sign-In. Check your connection.')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Sign-In. Check your connection.'));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

export async function requestAccessToken(clientId, { selectAccount = false } = {}) {
  if (!clientId) throw new Error('Add a Google OAuth Client ID in Settings first.');
  await loadGisScript();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000,
        });
      },
      error_callback: (error) => {
        reject(new Error(error?.message || 'Google sign-in was cancelled.'));
      },
    });

    tokenClient.requestAccessToken(selectAccount ? { prompt: 'select_account' } : { prompt: '' });
  });
}

export function revokeToken(accessToken) {
  if (!accessToken || !window.google?.accounts?.oauth2) return;
  window.google.accounts.oauth2.revoke(accessToken, () => {});
}
