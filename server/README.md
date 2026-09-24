# Digital Timetable — backend

Optional backend for the [Digital Timetable](../README.md) PWA. Three jobs:

1. **Auth** — verifies the Google ID token the frontend already obtains via
   Google Identity Services, and issues its own access/refresh JWT session.
2. **Sync** — per-record push/pull sync so multiple devices merge cleanly
   instead of overwriting a single file (the old Google Drive approach).
3. **Reminders** — a minute-by-minute scheduler that delivers reminders via
   Web Push even when the app is closed, which a client-only PWA cannot do.

Without this, the app still works fully offline on a single device — see
the main README's [Backend section](../README.md#-backend-sync--real-background-reminders).

## Stack

Node.js + Express + PostgreSQL, via [Prisma](https://www.prisma.io/). No
framework magic beyond that — plain REST endpoints, a relational schema
that mirrors the client's data model (`prisma/schema.prisma`), and a
`setInterval` scheduler (not a job queue — this app's scale doesn't need
one).

## Local setup

Requires Node 18+ and a Postgres instance (local or hosted).

```bash
cd server
cp .env.example .env        # fill in DATABASE_URL, see below
npm install
npm run vapid:generate       # prints VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — paste into .env
npm run migrate:dev           # creates the schema
npm run dev                   # starts on :8787 (or PORT from .env)
```

### Environment variables (`.env`)

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `GOOGLE_CLIENT_ID` | Same OAuth Client ID the frontend uses — must match exactly, or ID token verification fails. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Random secrets signing this app's own session tokens. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push keypair — `npm run vapid:generate` creates one. Reminders silently no-op without these set (the scheduler logs a warning and doesn't start). |
| `CORS_ORIGINS` | Comma-separated list of origins allowed to call this API — the URL(s) you serve the frontend from. |
| `PORT` | Defaults to 8787. |

## Data model

`prisma/schema.prisma` has one table per client entity (Subject, ClassSession,
Note, Resource, Flashcard, Quiz, Assessment, Assignment, FocusSession), each
row keyed by the client-generated `id` (a UUID — see `js/core/id.js`) plus
`userId` and a server-managed `updatedAt`. Settings and Term are one row per
user rather than a list. See the comment at the top of the schema file for
the sync design rationale (why client-generated IDs, why soft deletes, why
`subjectId` isn't a real foreign key).

## API surface

- `POST /auth/google { idToken }` → `{ accessToken, refreshToken, user }`
- `POST /auth/refresh { refreshToken }` → new token pair (rotates the refresh token)
- `POST /auth/logout { refreshToken }`
- `GET /auth/me` (Bearer auth) → current user
- `POST /sync { cursor, changes, deletes }` (Bearer auth) → applies pushed
  changes, returns everything changed since `cursor`, plus a new cursor.
  See `src/lib/syncEntities.js` for the exact per-entity field list.
- `GET /push/vapid-public-key` → `{ publicKey }`
- `POST /push/subscribe { endpoint, keys }` (Bearer auth)
- `POST /push/unsubscribe { endpoint }` (Bearer auth)
- `GET /health`

## Reminder scheduler

`src/jobs/reminderScheduler.js` runs every 60 seconds. For every user with
`notificationsEnabled` and at least one push subscription, it evaluates the
same tiered reminder rules as the client's `notifications.js` (ported in
`src/lib/reminderEngine.js` — same dedup keys, same daily cap, same "10
minutes before class" exemption from that cap), in the user's own timezone
(`UserSettings.timezone`, captured client-side and synced up), and sends a
Web Push message to each of that user's subscribed devices. Dead
subscriptions (410/404 on push) are deleted automatically.

## Deploying

Any Node host with a reachable Postgres database works — Railway, Render,
Fly.io, a VPS, etc. The general shape:

1. Provision Postgres, set `DATABASE_URL`.
2. Set the rest of the environment variables above.
3. `npm ci && npm run migrate && npm start` (`migrate` runs
   `prisma migrate deploy`, which applies committed migrations without
   prompting — use this in production, not `migrate:dev`).
4. Point the frontend at the deployed URL: Settings → Account & sync →
   Server URL in the app.

There's no Dockerfile in this repo yet — the app has no build step, so a
platform's Node buildpack (Railway/Render's default) works without one. Add
one if your host needs it.

## Testing without a real Google sign-in

`verifyIdToken` requires a real, freshly-issued Google ID token, which
needs a real browser and Google account — not reproducible from a script.
To exercise `/sync` and `/push` directly, sign a JWT the same way
`/auth/google` would after creating a `User` row yourself (via Prisma
Studio: `npm run studio`, or a one-off script), then call the API with
`Authorization: Bearer <that token>`.
