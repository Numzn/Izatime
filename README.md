# Iza:time PWA 📱⏳

A Progressive Web App (PWA) timetable for Iza — installable on Android like a native app.

---

## 🚀 Quick Start

### Development
```bash
npm run dev
# or
python -m http.server 8000
```

### GitHub Pages Deployment
1. Go to your repository: https://github.com/Numzn/Izatime
2. Click **Settings** → **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Select **master** branch and **/(root)** folder
5. Click **Save**
6. Your PWA will be live at: `https://numzn.github.io/Izatime/`

### Netlify Deployment (Alternative)
- **Netlify**: Drag the entire folder to [netlify.com/drop](https://netlify.com/drop)
- **URL**: Get instant HTTPS URL + deployment

---

## ✅ Features

- **📱 PWA Ready**: Install on mobile devices
- **⚡ Offline Support**: Works without internet
- **🎨 Modern UI**: Clean, responsive design
- **🕐 Live Clock**: Real-time date/time display
- **📅 Smart Today Detection**: Highlights current day
- **🔄 Dual Views**: School and Study schedules
- **🎯 Error Handling**: Robust error recovery
- **📦 Modular Code**: ES6 modules for maintainability

---

## 📁 Project Structure

```
iza-time-netlify/
├── index.html           ← Main HTML file
├── css/
│   └── styles.css       ← All styles
├── js/
│   ├── data.js          ← Timetable data & mappings
│   ├── ui.js            ← UI rendering & event handlers
│   ├── pwa.js           ← PWA functionality
│   └── app.js           ← Main initialization
├── manifest.json        ← PWA config
├── sw.js                ← Service worker (offline)
├── package.json         ← Development config
└── icons/               ← PWA icons
```

---

## ✏️ Customization

### Edit Timetable Data
Open `js/data.js` and modify:
- `schoolData`: School schedule by day
- `studyData`: Study schedule by day
- `subjectFull`: Subject code to full name mapping
- `iconMap`: Subject code to emoji icon mapping

### Edit Styles
Modify `css/styles.css` for:
- Colors, fonts, spacing
- Animations and transitions
- Responsive breakpoints

### Edit PWA Settings
Update `manifest.json` for:
- App name and description
- Theme colors
- Icon paths

---

## 🛠️ Development

### Available Scripts
```bash
npm start    # Start development server
npm run dev  # Same as start
npm run build # No-op (static site)
```

### Browser Support
- ✅ Chrome 61+
- ✅ Firefox 60+
- ✅ Safari 11+
- ✅ Edge 79+
- ❌ IE 11 and below (ES6 modules not supported)

### Error Handling
The app includes comprehensive error handling:
- DOM element validation
- Network failure recovery
- Module loading fallbacks
- User-friendly error messages

---

## 🚀 Deployment Options

### Option A — Netlify (Recommended)
1. Go to [netlify.com/drop](https://netlify.com/drop)
2. Drag the entire `iza-time-netlify` folder
3. Get instant URL + HTTPS

### Option B — GitHub Pages
1. Create GitHub repository
2. Upload all files
3. Settings → Pages → Branch: main
4. URL: `https://username.github.io/repo-name`

### Option C — Manual Hosting
Upload all files to any static web host that supports HTTPS.

---

## 📱 Installation on Mobile

1. Open the app URL in Chrome/Safari
2. Look for "Add to Home Screen" banner
3. Tap Install
4. App appears on home screen like native app

---

## 🔧 Troubleshooting

### App Won't Load
- Check browser console for errors
- Ensure ES6 modules are supported
- Try refreshing the page

### PWA Won't Install
- Must be served over HTTPS
- Check manifest.json is valid
- Service worker must register successfully

### Offline Not Working
- Check service worker is registered
- Verify cache is populated
- Check browser developer tools → Application → Storage

---

## 📈 Performance

- **First Load**: ~50KB (cached)
- **Subsequent Loads**: Instant (service worker)
- **Offline**: Full functionality
- **Lighthouse Score**: 95+ (typical)

---

## 🤝 Contributing

1. Fork the repository
2. Make changes
3. Test thoroughly
4. Submit pull request

---

## 📄 License

MIT License - feel free to use and modify!
│   ├── ui.js            ← UI rendering and event handlers
│   ├── pwa.js           ← PWA functionality
│   └── app.js           ← Main application initialization
├── manifest.json        ← PWA config (name, icon, colors)
├── sw.js                ← Service worker (offline caching)
└── icons/
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-192x192.png
    └── icon-512x512.png
```

---

## ✏️ Editing the timetable

Open `js/data.js` and edit the `schoolData` and `studyData` objects. Changes are instant when you refresh the page.
