// Registers this browser with the backend's Web Push scheduler (see
// server/src/jobs/reminderScheduler.js) so reminders can be delivered even
// when the app isn't open — the whole point of moving reminders off the
// old setInterval-in-the-open-tab approach (js/app.js's startNotificationLoop,
// still kept as a same-tab fallback/instant-check, see notifications.js).
import { apiFetch } from './backendApi.js';
import * as auth from './backendAuth.js';
import * as backendSync from './backendSync.js';

let cachedVapidKey = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function ensureSubscribed() {
  if (!backendSync.isConnected()) return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    if (!cachedVapidKey) {
      const data = await apiFetch('/push/vapid-public-key').catch(() => null);
      cachedVapidKey = data?.publicKey || null;
    }
    if (!cachedVapidKey) return false; // server hasn't generated VAPID keys yet
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cachedVapidKey),
    });
  }

  const json = subscription.toJSON();
  const accessToken = await auth.getAccessToken();
  await apiFetch('/push/subscribe', {
    method: 'POST',
    accessToken,
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  return true;
}

export async function unsubscribe() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {});

  if (backendSync.isConnected()) {
    const accessToken = await auth.getAccessToken().catch(() => null);
    if (accessToken) {
      await apiFetch('/push/unsubscribe', { method: 'POST', accessToken, body: { endpoint } }).catch(() => {});
    }
  }
}
