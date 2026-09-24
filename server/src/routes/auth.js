import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';
import {
  signAccessToken, generateRefreshToken, hashRefreshToken, refreshTokenExpiry,
} from '../lib/tokens.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const googleClient = new OAuth2Client(env.googleClientId);

function toPublicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name, picture: user.picture,
  };
}

async function issueSession(userId) {
  const accessToken = signAccessToken(userId);
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshTokenExpiry() },
  });
  return { accessToken, refreshToken };
}

// Exchanges the Google ID token the client already obtains via Google
// Identity Services (js/services/googleAuth.js) for our own session. The
// client-side OAuth flow doesn't change at all — this just adds a
// server-side verification step so we can trust `sub` as this app's user
// identity instead of taking the client's word for it.
router.post('/google', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken is required.' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch (error) {
    return res.status(401).json({ error: 'Could not verify Google ID token.' });
  }

  const user = await prisma.user.upsert({
    where: { googleSub: payload.sub },
    update: { email: payload.email || '', name: payload.name || payload.email || 'Google account', picture: payload.picture || null },
    create: {
      googleSub: payload.sub,
      email: payload.email || '',
      name: payload.name || payload.email || 'Google account',
      picture: payload.picture || null,
      settings: { create: {} },
      term: { create: {} },
    },
  });

  const { accessToken, refreshToken } = await issueSession(user.id);
  return res.json({ accessToken, refreshToken, user: toPublicUser(user) });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });

  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
    return res.status(401).json({ error: 'Refresh token is invalid or expired. Sign in again.' });
  }

  // Rotate: the old refresh token is single-use, so a leaked-and-replayed
  // token gets invalidated the moment the legitimate device uses it next.
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const { accessToken, refreshToken: nextRefreshToken } = await issueSession(stored.userId);
  return res.json({ accessToken, refreshToken: nextRefreshToken });
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { tokenHash: hashRefreshToken(refreshToken) } });
  }
  return res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user: toPublicUser(user) });
});

export default router;
