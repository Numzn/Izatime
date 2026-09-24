import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { env } from '../env.js';

const router = Router();

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: env.vapidPublicKey });
});

router.post('/subscribe', requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint and keys.{p256dh,auth} are required.' });
  }

  // Re-subscribing the same endpoint (a page reload re-registers) just
  // refreshes ownership/keys rather than erroring on the unique constraint
  // — and reassigns it if a different account signs in on the same device.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.userId, p256dh: keys.p256dh, auth: keys.auth },
    create: {
      userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth,
    },
  });
  return res.status(204).end();
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required.' });
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
  return res.status(204).end();
});

export default router;
