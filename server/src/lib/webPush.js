import webpush from 'web-push';
import { env } from '../env.js';

let configured = false;

export function isConfigured() {
  return !!(env.vapidPublicKey && env.vapidPrivateKey);
}

function ensureConfigured() {
  if (configured || !isConfigured()) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  configured = true;
}

// Sends to one subscription. Returns { ok, gone } — `gone` means the
// subscription is dead (410/404, e.g. the user uninstalled or cleared
// site data) and the caller should delete it rather than keep retrying.
export async function sendPush(subscription, payload) {
  ensureConfigured();
  if (!isConfigured()) return { ok: false, gone: false, error: 'VAPID keys not configured.' };

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
    );
    return { ok: true, gone: false };
  } catch (error) {
    const gone = error.statusCode === 404 || error.statusCode === 410;
    return { ok: false, gone, error: error.message };
  }
}
