import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../env.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtAccessSecret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtAccessSecret);
  return payload.sub;
}

// Refresh tokens are opaque random strings, not JWTs — the JWT machinery
// buys nothing extra here since every refresh is checked against the DB
// anyway (to allow revocation on logout), so a signed token would just be
// a longer way to write the same random ID. We store a hash, never the
// token itself, so a DB leak alone doesn't let anyone mint sessions.
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}
