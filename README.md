# NumzStudy

A calm, offline-first class timetable and academic planner PWA. Its mission:
help students never miss a class, assignment, or exam. Plan your timetable,
track assignments and assessments per subject, review with spaced repetition,
focus with a Pomodoro timer, and see real progress — all backed by a
heuristic (no external API) Academic Planner.

On first run the app is pre-loaded with a real class timetable (see
`js/core/seedTimetable.js`) — edit or delete it in Timetable like any other
data, or reset it entirely from Settings.

---

## 🚀 Quick Start

```bash
npm run dev
# or
python -m http.server 8000
```

Open `http://localhost:8000`. No build step — plain ES modules loaded natively.

---

## ✅ Features

Three bottom-nav destinations, plus two contextual screens launched from
within them:

- **🏠 Today** — a next-class hero card with a live countdown, the rest of
  today's classes, everything due soon (assignments + assessments merged
  and sorted), the next free study window between classes (a plain fact,
  computed from your schedule — nothing to enter), and one top suggestion
  from the Academic Planner.
- **🗓️ Timetable** — a Monday-aligned week strip, or a full month calendar
  (toggle in-view), plus a day agenda combining classes, assignment due
  dates, and assessments on that day. Add one-off or weekly-recurring
  classes with room/lecturer.
- **📚 Subject Workspace** — the per-subject home: Overview (with a
  "Taught by ..." line rolled up from that subject's classes), Classes,
  Assignments, Assessments, Notes, Resources (links to slides, past papers,
  readings — click to open, separate button to edit), Flashcards
  (+ generated quizzes), and History, all in one tabbed screen instead of
  scattered across separate views.
- **🍅 Focus** *(contextual, launched from a subject's "Prepare now")* —
  configurable Pomodoro (focus/break/long break) with a 7-day focus history.
- **📈 Progress** *(contextual, launched from a subject's History tab)* —
  study trend, completion rate, per-subject performance, and weak-area
  flags.
- **✨ Academic Planner** — a rule-based engine (not a hosted LLM — see
  below) that ranks by urgency across next class, most-urgent assignment,
  exam revision (cross-referenced against real flashcard mastery),
  neglected subjects, workload clustering, and — when there's a real free
  window before your next class — framing due flashcard reviews around it
  ("2h free — good time for 3 due reviews") instead of just "reviews due."
- **🔔 Tiered, per-category notifications** — classes get 1-day/1-hour/
  10-minute reminders (the 10-minute tier is exempt from the daily cap —
  missing a class is the whole point), assignments get an effort-scaled
  lead reminder plus 3-day/1-day/day-of, assessments get 1-week/3-day/
  1-day/day-of. Deduplicated per item, quiet-hours aware, requires explicit
  permission from Settings — and each category (classes/assignments/
  assessments/neglected-subject nudges) can be switched off independently.
  Time-critical ones fire as "insistent" (vibrate + stay on screen until
  dismissed) — the strongest a web app can make a notification; it cannot
  ring through the device's own silent mode or Do Not Disturb, since no
  web API grants that. Shown through the service worker's
  `showNotification()` rather than a direct `new Notification()` call —
  several mobile browsers (Chrome for Android among them) throw if you
  construct one directly from the page and require the service worker
  path instead; this app tries that first and only falls back to the
  direct constructor where no active registration exists (older desktop
  contexts). Settings has a "Send test notification" button that reports
  honestly if display actually failed, to confirm permission and this
  behavior on your device.
- **📳 Vibration** — reminders vibrate the device directly (via the
  Vibration API, not just the notification's own vibrate option, which is
  inconsistently honored) alongside a few meaningful in-app moments:
  checking off a class, a focus or break timer finishing, a flashcard
  review deck completed. One toggle in Settings → Notifications turns all
  of it off if you'd rather it stayed quiet.
- **📅 Calendar export (.ics)** — download every class, assignment, and
  assessment as a standard calendar file and import it into Google
  Calendar, Apple Calendar, or Outlook — the reliability backstop for
  reminders a browser tab can't deliver in the background. Settings →
  Calendar sync.
- **📥 Timetable import (CSV or .ics)** — the timetable is the single source
  of truth: import it once and everything else — Today, the week and month
  views, Subject Workspace, reminders, the Academic Planner — populates
  itself from what got created, nothing re-entered. Both formats share one
  subject-resolver: CSV's dedicated `subject` column matches by exact name;
  an `.ics` event's free-text title matches by substring against your
  existing subjects, or groups under an auto-created "Imported" subject if
  nothing matches. `.ics` also picks up a lecturer from the `ORGANIZER`
  field where the source calendar sets one. Weekly recurrence is preserved
  either way. Finishing an import shows a summary of what was created, plus
  a single tap to turn reminders on if permission hasn't been decided yet —
  and, the first time it's relevant, a chance to set the semester end date
  (see below).
  Settings → Timetable import.
- **🎓 Semester** — one end date, set once (Settings → Semester, or
  prompted right after your first import), that every new or imported
  weekly class defaults its recurrence to stop at — instead of asking per
  class or running forever. Purely optional; leave it blank and classes
  keep repeating indefinitely, same as before.
- **⚡ Offline-first** — service worker precaches the full app shell; all
  data lives in `localStorage` with an automatic rolling backup.
- **🌗 Theme** — light/dark/system, plus data export/import/reset in
  Settings.
- **🔄 Sync + real background reminders** *(optional, needs `server/`)* —
  sign in with Google to sync your timetable to your own backend and pick
  it up on another device, with per-record conflict resolution (not a
  single overwritten file). The same backend runs a scheduler that pushes
  reminders via Web Push even when the app is closed — the thing a
  client-only PWA structurally cannot do. Fully optional; the app is
  completely offline-capable without it. See below.

### About the "AI"
There's no external API call and no network dependency — the Academic
Planner is heuristic logic over your real data (due dates, weights, ease
factors, completion rates). This keeps the app fully offline, free,
instant, and free of any client-side API-key exposure. It recommends *what*
and *when* to study; it doesn't generate original explanations of subject
content.

### Assignments vs. Assessments
Two distinct entities, on purpose — they have different urgency curves and
different reminder shapes. An **Assignment** is work you produce and submit
by a deadline (homework, project, essay, lab, reading), with a status
workflow (not started → in progress → submitted → graded), a derived
priority (from days left, weight, and subject priority — overridable), and
an optional checklist for breaking the work into steps. An **Assessment**
is something you sit down for at a specific time (quiz, test, exam,
practical), optionally timed, with its own reminder tiers.

### One class, one form, everywhere
Adding or editing a class always uses the same form — from Timetable, from
a subject's Classes tab, wherever — and it always includes a subject
picker. A class created under the wrong subject (by an import's best-effort
matching, or by hand) can always be reassigned from any screen it's edited
on, not just some of them. Assignments and Assessments carry the same
subject picker for the same reason.

---

## 📁 Project Structure

```
Izatime/
├── index.html                 ← App shell only (header, nav, mount points)
├── manifest.json               ← PWA config
├── sw.js                       ← Service worker (offline cache)
├── Dockerfile                  ← all-in-one image (frontend + server/ + Postgres)
├── docker-entrypoint.sh         ← boots Postgres, secrets, migrations, then the server
├── css/
│   ├── base.css                 design tokens, reset, app shell, splash
│   ├── components.css           buttons, forms, chips, modal, toast, charts
│   └── views.css                per-screen layout (dashboard/focus/analytics)
├── js/
│   ├── app.js                   bootstrap + hash-free router
│   ├── pwa.js                   service worker reg, offline ribbon, install prompt
│   ├── core/
│   │   ├── store.js              localStorage persistence, migrations, backup
│   │   ├── models.js             entity factories + default state
│   │   ├── events.js             tiny pub/sub bus
│   │   ├── dates.js              day-key date helpers (no timezone bugs)
│   │   └── id.js                 UUID helper
│   ├── services/
│   │   ├── scheduler.js          recurring/one-off session expansion
│   │   ├── freeTime.js           free-study-period calculation between classes
│   │   ├── assignments.js        assignment/assessment queries, derived priority
│   │   ├── spacedRepetition.js   SM-2 algorithm for flashcards
│   │   ├── aiCoach.js            Academic Planner recommendations, quiz generation
│   │   ├── analytics.js          study minutes, completion rate, weak areas
│   │   ├── focusTimer.js         Pomodoro state machine
│   │   ├── notifications.js      tiered, deduped, quiet-hours-aware reminders
│   │   ├── haptics.js            Vibration API wrapper + shared patterns
│   │   ├── icsExport.js          RFC5545 calendar (.ics) export
│   │   ├── icsImport.js          RFC5545 calendar (.ics) import
│   │   ├── csvImport.js          bulk timetable import from CSV
│   │   ├── timetableImport.js    subject-resolution shared by CSV + .ics import
│   │   ├── googleAuth.js         Google Identity Services ID-token sign-in
│   │   ├── backendApi.js         thin fetch wrapper for the backend
│   │   ├── backendAuth.js        access/refresh token lifecycle
│   │   ├── backendSync.js        diff-based per-record push/pull sync engine
│   │   └── pushSubscription.js   Web Push subscribe/unsubscribe (PushManager)
│   ├── components/               dom.js, toast.js, modal.js, charts.js, nav.js, sessionForm.js (shared add/edit-class form)
│   └── views/                    dashboard.js (Today), timetable.js, subjectWorkspace.js, focus.js, analyticsView.js, settings.js
├── icons/                       PWA icons (72px–512px)
└── server/                      optional backend — auth, sync, Web Push scheduler (see below)
```

Each service is a pure function layer over the store's state — no view
imports another view, and no service touches the DOM. Views subscribe to
store changes and re-render themselves; UI-only state (selected tab, open
review session) lives in the view module, not the store.

---

## 📥 Importing a timetable from CSV

Settings → Timetable import → Download CSV template for the exact columns.
Only `subject`, `title`, `day`, and `startTime` are required — one row per
weekly class:

```csv
subject,title,day,startTime,durationMinutes,lecturer,type,priority
Digital Logic,IT221 - Digital Logic,MON,19:00,60,Pharrol Kazeze (Mr),school,2
```

- `day`: `MON`..`SUN`
- `startTime`: 24-hour `HH:MM`
- `durationMinutes`, `priority` (1-3), `type` (`school`/`study`/`exam-prep`) are optional and default to `60`, `2`, `school`
- Subjects are matched by name (case-insensitive) or created if new
- Each row becomes a weekly-recurring session; invalid rows are skipped and reported in a toast (details in the browser console)

This is separate from **Export/Import backup**, which is a full JSON
snapshot of the whole app (all data, not just the timetable) for moving
between devices or restoring after a reset.

---

## 🔄 Backend: sync + real background reminders

Entirely optional — without it, everything still works exactly as
described above, just tied to one browser on one device, and reminders
only fire while the app is open (see [Troubleshooting](#-troubleshooting)
for why). The backend in `server/` closes both gaps: it's the source of
truth for synced data, and it runs the scheduler that actually delivers
reminders in the background via [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

### Why this needs a server at all

A pure client-side PWA has no process running when the tab isn't open —
there's nothing to check "is a class starting in 10 minutes?" once you've
backgrounded the app. The only way to deliver a notification at a precise
future time regardless of whether the app is open is for *something else*
to hold that schedule and push to the browser when the moment arrives.
That's what `server/` is: it owns the canonical copy of your data, and a
minute-by-minute scheduler (`server/src/jobs/reminderScheduler.js`) that
mirrors the exact same tiered reminder logic as `notifications.js`
client-side, evaluated in your own timezone, and delivers via Web Push.

### Setting it up

1. Deploy `server/` (see `server/README.md` for the full setup —
   Postgres, environment variables, running migrations, generating VAPID
   keys, and hosting options).
2. In the app, **Settings → Account & sync → Server URL**, paste in
   wherever you deployed it.
3. **Sign in with Google.** The same Google Identity Services flow as
   before, but now it exchanges a Google ID token for a session with your
   own backend (verified server-side against Google's public keys) rather
   than requesting a Drive-scoped access token — there's no Google Drive
   involved at all anymore.

### How sync behaves

- **Per-record, not whole-file.** Every subject, class, note, flashcard,
  etc. syncs and resolves conflicts independently (last-write-wins on
  that one record) — two devices editing *different* things offline
  between syncs no longer risk one clobbering the other's edits, the way
  a single overwritten JSON blob would.
- **Automatic** — every change auto-syncs a few seconds after you make it
  (debounced), plus a background pull every 5 minutes to pick up changes
  made from another device even when nothing changed locally here.
- **Manual "Sync now"** and a **last-synced timestamp** are in Settings; a
  small dot on the account icon in the header shows live status (grey =
  not syncing, amber pulse = syncing, green = synced, red = error/needs
  sign-in again).
- **Sign out** stops syncing and drops back to local-only storage — your
  data for that account stays cached on the device either way.
- **Offline-first, always**: sync is best-effort on top of `localStorage`,
  which remains the primary datastore. No network, no server, no Google
  account at all — the app works exactly the same, just without the
  cross-device piece and without background reminders.
- **Deletes propagate** as tombstones (soft-deleted server-side), so
  deleting something on one device removes it from others too, instead of
  just disappearing from one side's next sync payload.

### Using your own Google Cloud project (forks / other deployments)

The shipped Client ID is tied to this app's authorized origin. If you fork
this project to deploy it elsewhere, create your own free **Google OAuth
Client ID** and paste it into Settings → Account & sync → Change Client ID
(and into `server/.env`'s `GOOGLE_CLIENT_ID`, so the backend verifies
tokens against the same one):

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or reuse one).
2. **APIs & Services → OAuth consent screen** → choose **External** → fill in an app name and your email → save. You can leave it in **Testing** mode and add your own (and any friends') Google account under **Test users** — no Google verification needed for personal/small-group use.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type **Web application**.
4. Under **Authorized JavaScript origins**, add the exact URL you serve the app from, e.g. `https://yourname.github.io` (no path, no trailing slash) — and `http://localhost:8000` too if you want sign-in to work locally.
5. Copy the generated Client ID (`....apps.googleusercontent.com`) and paste it into the app (and the server's `.env`).

Leaving the field blank reverts to the built-in Client ID.

---

## ✏️ Customization

- **Data model**: see `js/core/models.js` for the shape of subjects, sessions, assignments, assessments, notes, resources, flashcards, quizzes, focus sessions, and the semester/term.
- **Styling**: change tokens in `css/base.css` (`:root` custom properties) to re-theme the whole app.
- **Notification rules**: tune tiers/caps/quiet-hours logic in `js/services/notifications.js`.
- **Spaced repetition**: tune the SM-2 constants in `js/services/spacedRepetition.js`.
- **Calendar export**: tune reminder framing or add new entity types to `js/services/icsExport.js`.
- **Timetable import**: subject-matching and lecturer/session creation live in `js/services/timetableImport.js`, shared by both `csvImport.js` and `icsImport.js` — change it once, both formats pick it up.
- **Free study periods**: tune the minimum gap size or the day's start/end bounds in `js/services/freeTime.js`.
- **Vibration patterns**: tune or add patterns in the `PATTERNS` object in `js/services/haptics.js`.

---

## 🛠️ Development

```bash
npm start    # Start a local static server
npm run dev  # Same as start
npm run build # No-op (static site, no bundler)
```

Any modern evergreen browser (Chrome, Firefox, Safari, Edge). ES modules required.

---

## 🚀 Deployment

### Frontend only (no sync, no background reminders)

**GitHub Pages**: Settings → Pages → Deploy from branch → `master` / `(root)` → live at `https://numzn.github.io/Izatime/`.

**Netlify**: drag the project folder onto [netlify.com/drop](https://netlify.com/drop).

Any static HTTPS host works — the app is fully offline-capable on its own,
same as always. See [Backend: sync + real background reminders](#-backend-sync--real-background-reminders)
for what adding the backend gets you.

### One image, everything included

`Dockerfile` at the repo root bundles the frontend, the backend, and a
local Postgres into a single image — one container is the whole app,
server included:

```bash
docker build -t numzstudy .
docker run -d \
  -p 8787:8787 \
  -e GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" \
  -v numzstudy-data:/data \
  --name numzstudy \
  numzstudy
```

Open `http://localhost:8787` — that's the app, and it's already pointed
at its own backend with nothing to configure in Settings (the page
detects it's being served by its own backend and skips the "Server URL"
prompt entirely). `GOOGLE_CLIENT_ID` is the one thing you must supply
yourself (see [Using your own Google Cloud project](#using-your-own-google-cloud-project-forks--other-deployments)
above) — everything else (Postgres, JWT signing secrets, a VAPID
keypair for push) is created automatically on first boot and persisted
under `/data`, so `-v numzstudy-data:/data` is the one volume worth
keeping across restarts/upgrades. Skip it and you get a working
container that forgets everything (including its own signing secrets)
every time it's recreated.

Point `DATABASE_URL` at an external Postgres instead (`-e
DATABASE_URL=postgresql://...`) to skip the bundled one — worth doing
for anything beyond personal/small-group use, since a single-container
Postgres has no separate backup/HA story of its own.

Separate hosting (frontend on a static host, `server/` deployed on its
own) still works exactly as described in the Backend section above; the
one-image path is just the fastest way to get both running somewhere
with a single command.

---

## 🔧 Troubleshooting

- **Stale UI after an update**: bump `CACHE_NAME` in `sw.js` so clients fetch fresh assets.
- **Notifications not firing**: check Settings shows "Allowed"; browsers block `Notification` permission requests outside a user gesture, quiet hours, or once 3/day have already fired. If reminders only ever fire while the app is open and never in the background, that's expected *without* the backend configured — a pure client-side PWA has nothing running to check the clock once the tab isn't open; see [Backend: sync + real background reminders](#-backend-sync--real-background-reminders).
- **Lost data**: local state lives under `izatime:data:local` (signed-out) or `izatime:data:<account-id>` per signed-in account, each with a rolling backup at the matching `izatime:backup:*` key. Export a backup from Settings regularly regardless — the backend is optional and local storage can still be cleared by the browser.
- **Sync says "needs sign-in"**: the backend session expired or was revoked — sign in again in Settings → Account & sync. Unlike the old Drive-based flow, a normal reload doesn't require this — the refresh token persists and syncing resumes automatically.

---

## 📄 License

MIT License — feel free to use and modify!
