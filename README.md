# Iza:time PWA 📱⏳

A Progressive Web App (PWA) timetable for Iza — installable on Android/iOS like a native app.

---

## 🚀 Quick Start

```bash
npm run dev
# or
python -m http.server 8000
```

Then open `http://localhost:8000`.

---

## ✅ Features

- **📱 PWA Ready**: Install on mobile devices, standalone display
- **⚡ Offline Support**: Service worker caches the app shell
- **🕐 Live Clock / Splash Screen**
- **📅 Day Tabs**: MON–SUN, current day auto-selected on load
- **🔄 Dual Views**: School and Study Plan schedules, tracked independently
- **➕ Session Management**: Add / edit / delete sessions via modal (name + time)
- **✅ Completion Tracking**: Checkbox per session, feeds streak & stats
- **🍅 Pomodoro Timer**: 25-minute focus timer (start/pause/reset)
- **💡 Smart Tips**: Contextual study tips based on today's progress
- **🌙 Focus Mode**: Dims the UI for distraction-free study
- **📡 Offline Ribbon**: Shows when the device loses connectivity

---

## 📁 Project Structure

```
Izatime/
├── index.html      ← Entire app: markup, styles, and logic (self-contained)
├── manifest.json    ← PWA config (name, icons, colors)
├── sw.js            ← Service worker (offline caching)
├── package.json     ← Dev scripts only (no build step)
└── icons/           ← PWA icons (72px–512px)
```

The app is intentionally a **single file**: all CSS lives in a `<style>` block
and all JS lives in a `<script>` block inside `index.html`. There is no build
step and no module bundler.

---

## ✏️ Customization

### Edit the timetable data
Open `index.html` and find `loadData()` — it seeds `timetableData.SCHOOL` and
`timetableData.STUDY` with example sessions the first time the app runs (no
saved data yet). After that, all edits happen through the UI (+ Add session,
✏️ edit, 🗑️ delete) and persist to `localStorage` under the key
`iza_smart_data`.

### Edit styles
All styles are in the `<style>` block at the top of `index.html`.

### Edit PWA settings
Update `manifest.json` for app name, description, theme colors, and icons.

---

## 🛠️ Development

### Available Scripts
```bash
npm start    # Start development server
npm run dev  # Same as start
npm run build # No-op (static site)
```

### Browser Support
Any modern evergreen browser (Chrome, Firefox, Safari, Edge). No IE support.

---

## 🚀 Deployment

### GitHub Pages
1. Go to the repository → **Settings → Pages**
2. Under **Source**, select **Deploy from a branch**
3. Select the **master** branch and **/(root)** folder → **Save**
4. Live at `https://numzn.github.io/Izatime/`

### Netlify (alternative)
Drag the project folder onto [netlify.com/drop](https://netlify.com/drop) for an instant HTTPS URL.

### Manual Hosting
Upload all files to any static host that supports HTTPS (required for service worker + install prompt).

---

## 📱 Installation on Mobile

1. Open the app URL in Chrome/Safari
2. Tap "Add to Home Screen" (or use the in-app install banner)
3. App appears on the home screen like a native app

---

## 🔧 Troubleshooting

### App Won't Load
- Check the browser console for errors
- Try a hard refresh

### PWA Won't Install
- Must be served over HTTPS (or localhost)
- Check `manifest.json` is valid
- Service worker must register successfully

### Offline Not Working
- Check the service worker is registered (DevTools → Application → Service Workers)
- Verify the cache is populated (DevTools → Application → Cache Storage)
- Bump `CACHE_NAME` in `sw.js` after changing cached files so clients pick up the update

### Stale Data After an Update
All state (timetable, completion, streaks) lives in `localStorage` under
`iza_smart_data`. Clear it via DevTools → Application → Local Storage if you
need a clean slate.

---

## 📄 License

MIT License - feel free to use and modify!
