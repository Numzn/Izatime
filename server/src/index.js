import { createApp } from './app.js';
import { env } from './env.js';
import { startReminderScheduler } from './jobs/reminderScheduler.js';
import { isConfigured as pushConfigured } from './lib/webPush.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`Izatime server listening on :${env.port}`);
  if (pushConfigured()) {
    startReminderScheduler();
    console.log('Reminder scheduler started.');
  } else {
    console.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications are disabled. Run `npm run vapid:generate`.');
  }
});
