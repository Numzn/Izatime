# Digital Timetable

A calm, offline-first class timetable and study companion PWA. Plan subjects
and sessions, review with spaced repetition, focus with a Pomodoro timer, and
see real progress — all backed by a heuristic (no external API) study coach.

On first run the app is pre-loaded with a real class timetable (see
`js/core/seedTimetable.js`) — edit or delete it in Planner like any other
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

- **🏠 Dashboard** — today's plan, next session, daily goal ring, streak, focus time, and top AI recommendations.
- **🗓️ Planner** — subjects, topics, one-off or recurring sessions, exams.
- **🍅 Focus** — configurable Pomodoro (focus/break/long break) with a 7-day focus history.
- **📚 Learning Hub** — per-subject notes, flashcards with spaced repetition (SM-2), and quizzes generated from your own flashcards.
- **📈 Progress** — study trend, completion rate, per-subject performance, and weak-area flags.
- **✨ AI Study Coach** — a rule-based engine (not a hosted LLM — see below) that surfaces neglected subjects, due reviews, upcoming exams, and one contextual tip a day.
- **🔔 Smart notifications** — capped at 3/day, deduplicated per item, quiet-hours aware. Requires explicit permission from Settings.
- **⚡ Offline-first** — service worker precaches the full app shell; all data lives in `localStorage` with an automatic rolling backup.
- **🌗 Theme** — light/dark/system, plus data export/import/reset in Settings.
- **🔄 Google Drive sync** *(optional)* — sign in to sync your timetable to your own Google Drive (minimal `drive.appdata` scope only) and pick it up on another device, with timestamp-based conflict resolution and retry-with-backoff. Fully optional and works out of the box; the app is completely offline-capable without it. See below.

### About the "AI"
There's no external API call and no network dependency — the coach is
heuristic logic over your real data (due dates, completion rates, ease
factors, streaks). This keeps the app fully offline, free, instant, and
free of any client-side API-key exposure. It recommends *what* and *when*
to study; it doesn't generate original explanations of subject content.

---

## 📁 Project Structure

```
Izatime/
├── index.html                 ← App shell only (header, nav, mount points)
├── manifest.json               ← PWA config
├── sw.js                       ← Service worker (offline cache)
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
│   │   ├── spacedRepetition.js   SM-2 algorithm for topics & flashcards
│   │   ├── aiCoach.js            recommendations, daily tip, quiz generation
│   │   ├── analytics.js          study minutes, completion rate, weak areas
│   │   ├── focusTimer.js         Pomodoro state machine
│   │   ├── notifications.js      capped/deduped/quiet-hours notification rules
│   │   ├── csvImport.js          bulk timetable import from CSV
│   │   ├── googleAuth.js         Google Identity Services sign-in/token
│   │   ├── driveSync.js          Drive appDataFolder file read/write
│   │   └── googleSync.js         orchestrates sign-in, pull-or-seed, auto-push
│   ├── components/               dom.js, toast.js, modal.js, charts.js, nav.js
│   └── views/                    dashboard.js, planner.js, focus.js, learningHub.js, analyticsView.js, settings.js
└── icons/                       PWA icons (72px–512px)
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

## 🔄 Google Drive sync

Entirely optional — without it, everything still works, just tied to one
browser on one device. **Settings → Account & sync → Sign in with Google**
works out of the box on this deployment; no setup needed. Each person who
signs in gets their own private copy of the app's data synced to their own
Google Drive, in the hidden `appDataFolder` (invisible in their normal
Drive, and inaccessible to this app or anyone else) — nothing is shared
between accounts, and signing in on a shared device never shows someone
else's timetable unless they sign in themselves.

**Minimal scope, no server.** The app requests exactly one OAuth scope,
`drive.appdata` — enough to read/write its own hidden sync file and
nothing else in your Drive. There's no backend: the browser talks to
Google's APIs directly using [Google Identity Services](https://developers.google.com/identity/gsi/web)
(not the deprecated `gapi.auth2`), so this stays a static site with no
Client Secret anywhere. Even the "who's signed in" name/email/photo shown
in the app comes from Drive's own `about.get` endpoint, which works under
`drive.appdata` alone — no separate identity scope required.

**How sync behaves:**
- **Sign in** pulls your existing synced data if Drive already has some
  newer than what's on this device, or seeds Drive from this device if
  not (see conflict resolution below).
- **Automatic backup** — every change auto-syncs to Drive a few seconds
  after you make it (debounced, so rapid edits don't spam the network).
- **Automatic restore on new devices** — sign in anywhere and your Drive
  copy comes down automatically if it's newer than the empty/local state.
- **Manual "Sync now"** and a **last-synced timestamp** are in Settings;
  a small dot on the account icon in the header shows live status (grey
  = not syncing, amber pulse = syncing, green = synced, red = error/needs
  sign-in again).
- **Sign out** stops syncing and drops back to local-only storage — your
  data for that account stays cached on the device either way.
- **Conflict resolution**: every save carries its own timestamp. On sign-in
  and before every sync, the app compares the local timestamp against
  Drive's copy — whichever is actually newer wins. If another device
  synced more recently than this one knows about, that version is pulled
  instead of being overwritten.
- **Retries**: Drive requests retry up to 3 times with exponential backoff
  on network errors, rate limiting (429), or server errors (5xx). A
  rejected session (401) isn't retried — instead sync pauses and the UI
  asks you to sign in again.
- **Offline-first, always**: Drive sync is best-effort on top of
  localStorage, which remains the primary datastore. No network, no
  Google account, and no Client ID at all — the app works exactly the
  same, just without the cross-device piece.

Because this uses a client-side-only OAuth flow (no server to hold a
refresh token), sync pauses after closing the browser — reopening the app
shows your last-synced data immediately, but you'll need to tap **Resume
sync** once to reconnect.

### Using your own Google Cloud project (forks / other deployments)

The shipped Client ID is tied to this app's authorized origin. If you fork
this project to deploy it elsewhere, create your own free **Google OAuth
Client ID** and paste it into Settings → Account & sync → Change Client ID:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or reuse one).
2. **APIs & Services → Library** → search **Google Drive API** → Enable.
3. **APIs & Services → OAuth consent screen** → choose **External** → fill in an app name and your email → save. You can leave it in **Testing** mode and add your own (and any friends') Google account under **Test users** — no Google verification needed for personal/small-group use.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type **Web application**.
5. Under **Authorized JavaScript origins**, add the exact URL you serve the app from, e.g. `https://yourname.github.io` (no path, no trailing slash) — and `http://localhost:8000` too if you want sync to work locally.
6. Copy the generated Client ID (`....apps.googleusercontent.com`) and paste it into the app.

Leaving the field blank reverts to the built-in Client ID.

---

## ✏️ Customization

- **Data model**: see `js/core/models.js` for the shape of subjects, topics, sessions, notes, flashcards, quizzes, exams, and focus sessions.
- **Styling**: change tokens in `css/base.css` (`:root` custom properties) to re-theme the whole app.
- **Notification rules**: tune caps/quiet-hours logic in `js/services/notifications.js`.
- **Spaced repetition**: tune the SM-2 constants in `js/services/spacedRepetition.js`.

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

**GitHub Pages**: Settings → Pages → Deploy from branch → `master` / `(root)` → live at `https://numzn.github.io/Izatime/`.

**Netlify**: drag the project folder onto [netlify.com/drop](https://netlify.com/drop).

Any static HTTPS host works — there's no backend.

---

## 🔧 Troubleshooting

- **Stale UI after an update**: bump `CACHE_NAME` in `sw.js` so clients fetch fresh assets.
- **Notifications not firing**: check Settings shows "Allowed"; browsers block `Notification` permission requests outside a user gesture, quiet hours, or once 3/day have already fired.
- **Lost data**: local state lives under `izatime:data:local` (signed-out) or `izatime:data:<account-id>` per signed-in account, each with a rolling backup at the matching `izatime:backup:*` key. Export a backup from Settings regularly regardless — Drive sync is optional and local storage can still be cleared by the browser.
- **Sync says "paused"**: this is expected after closing the browser (see above) — tap **Resume sync** in Settings → Account & sync.

---

## 📄 License

MIT License — feel free to use and modify!
