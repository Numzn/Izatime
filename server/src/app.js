import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { prisma } from './lib/prisma.js';
import authRoutes from './routes/auth.js';
import syncRoutes from './routes/sync.js';
import pushRoutes from './routes/push.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The all-in-one Docker image (see Dockerfile at the repo root) bundles
// the static frontend alongside this server and serves both from one
// process/port. Plain `npm run dev` without Docker doesn't get this: the
// frontend files simply aren't there relative to this file unless
// something copied them in, so this whole block is a no-op for local
// backend-only development, which keeps working exactly as before.
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.resolve(__dirname, '../../');
const INDEX_HTML = path.join(FRONTEND_DIR, 'index.html');
const servesFrontend = fs.existsSync(INDEX_HTML);

// Injects a marker the frontend's getBackendUrl() (js/core/store.js) reads
// to auto-target "wherever this page was served from" instead of asking
// the user to paste in a server URL — safe to assume only because we know
// for a fact this exact server is what served this exact page.
function renderIndexHtml() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  return html.replace('</head>', '<script>window.__NUMZSTUDY_SAME_ORIGIN_BACKEND__ = true;</script></head>');
}

export function createApp() {
  const app = express();

  app.use(helmet({
    // Helmet's default CSP is 'self'-only, which would silently break
    // Google Identity Services (script + connect to accounts.google.com)
    // and Google Fonts the moment the frontend is served from here — both
    // of which the standalone static deployment already relies on with no
    // CSP at all. Turning it off here doesn't regress anything relative
    // to that baseline; it just avoids adding a new restriction on top of
    // functionality that was already shipping.
    contentSecurityPolicy: false,
  }));
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

  // Reports on the database too, not just the process: an orchestrator or
  // monitor polling this should see "down" when every real request would fail
  // because Postgres is unreachable, instead of a healthy-looking server.
  app.get('/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch (error) {
      console.error('Health check: database unreachable:', error.message);
      res.status(503).json({ ok: false, error: 'Database unreachable.' });
    }
  });

  if (servesFrontend) {
    app.get('/', (req, res) => res.type('html').send(renderIndexHtml()));
    app.get('/index.html', (req, res) => res.type('html').send(renderIndexHtml()));
    app.use(express.static(FRONTEND_DIR, { index: false }));
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
