const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisLoadPromise = null;

function loadGisScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
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

// Gets a Google ID token (a signed JWT asserting who the user is) rather
// than an OAuth access token — the backend needs something it can verify
// on its own against Google's public keys (see server/src/routes/auth.js),
// not a bearer credential scoped to calling Google's own APIs. This is
// Google Identity Services' "Sign In With Google" flow, prompted from our
// own button's click handler so it's a real user gesture rather than an
// unprompted auto-display (which browsers/GIS are more likely to suppress).
export async function requestIdToken(clientId) {
  if (!clientId) throw new Error('Set the Google OAuth Client ID first.');
  await loadGisScript();

  return new Promise((resolve, reject) => {
    let settled = false;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (settled) return;
        settled = true;
        if (response?.credential) resolve(response.credential);
        else reject(new Error('Google sign-in did not return a credential.'));
      },
      use_fedcm_for_prompt: true,
    });

    window.google.accounts.id.prompt((notification) => {
      if (settled) return;
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        settled = true;
        reject(new Error('Google sign-in was closed or blocked. Check third-party sign-in is allowed for this site and try again.'));
      }
    });
  });
}
