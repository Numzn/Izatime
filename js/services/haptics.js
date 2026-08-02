// A thin, safe wrapper over the Vibration API. Deliberately separate from
// the Notification API's own `vibrate` option (notifications.js sets that
// too) — that option only ever fires if the OS/browser actually honors it
// for a background-delivered notification, which is inconsistent. Calling
// navigator.vibrate() directly here is the more reliable path whenever the
// tab is actually open and visible, which covers both "I'm looking at the
// app when a reminder fires" and every in-app interaction below.
export function isSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrate(pattern) {
  if (!isSupported()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch (error) {
    return false;
  }
}

export const PATTERNS = {
  tap: 12, // light acknowledgment of a minor UI action
  confirm: 35, // a completed action — checked off, saved
  success: [30, 50, 30], // a bigger completion — a session, a review deck finished
  gentle: [120, 60, 120], // a lower-urgency notification
  insistent: [200, 100, 200, 100, 200], // a time-critical notification
};
