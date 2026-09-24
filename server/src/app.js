import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import authRoutes from './routes/auth.js';
import syncRoutes from './routes/sync.js';
import pushRoutes from './routes/push.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.corsOrigins.length ? env.corsOrigins : false,
    credentials: false,
  }));
  app.use(express.json({ limit: '2mb' }));

  // Auth endpoints take arbitrary tokens from the internet before any
  // session exists to rate-limit by user — cap by IP so credential
  // stuffing / token-guessing can't hammer Google's verification endpoint
  // or the DB through us.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
  app.use('/auth', authLimiter, authRoutes);

  app.use('/sync', syncRoutes);
  app.use('/push', pushRoutes);

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
