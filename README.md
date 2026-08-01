# Iza:time — AI Study Suite 🧠⏳

A calm, offline-first study companion PWA. Plan subjects and sessions, review
with spaced repetition, focus with a Pomodoro timer, and see real progress —
all backed by a heuristic (no external API) study coach.

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
│   │   └── notifications.js      capped/deduped/quiet-hours notification rules
│   ├── components/               dom.js, toast.js, modal.js, charts.js, nav.js
│   └── views/                    dashboard.js, planner.js, focus.js, learningHub.js, analyticsView.js, settings.js
└── icons/                       PWA icons (72px–512px)
```

Each service is a pure function layer over the store's state — no view
imports another view, and no service touches the DOM. Views subscribe to
store changes and re-render themselves; UI-only state (selected tab, open
review session) lives in the view module, not the store.

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
- **Lost data**: all state lives under the `izatime:data` localStorage key, with the previous version kept at `izatime:backup`. Export a backup from Settings regularly — this is a single-device app with no sync.

---

## 📄 License

MIT License — feel free to use and modify!
