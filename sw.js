const CACHE_NAME = 'digital-timetable-v3.3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './js/app.js',
  './js/pwa.js',
  './js/core/id.js',
  './js/core/dates.js',
  './js/core/events.js',
  './js/core/models.js',
  './js/core/store.js',
  './js/core/seedTimetable.js',
  './js/services/scheduler.js',
  './js/services/spacedRepetition.js',
  './js/services/analytics.js',
  './js/services/aiCoach.js',
  './js/services/focusTimer.js',
  './js/services/notifications.js',
  './js/services/csvImport.js',
  './js/services/icsExport.js',
  './js/services/icsImport.js',
  './js/services/timetableImport.js',
  './js/services/freeTime.js',
  './js/services/assignments.js',
  './js/services/googleAuth.js',
  './js/services/driveSync.js',
  './js/services/googleSync.js',
  './js/components/dom.js',
  './js/components/toast.js',
  './js/components/modal.js',
  './js/components/charts.js',
  './js/components/nav.js',
  './js/components/icons.js',
  './js/components/sessionForm.js',
  './js/views/dashboard.js',
  './js/views/timetable.js',
  './js/views/focus.js',
  './js/views/subjectWorkspace.js',
  './js/views/analyticsView.js',
  './js/views/settings.js',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Install: cache all static assets
self.addEventListener('install', event => {
  console.log('SW: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => {
      console.log('SW: All assets cached');
      return self.skipWaiting();
    }).catch(error => {
      console.error('SW: Cache failed:', error);
    })
  );
});

// Activate: clear old caches and claim clients
self.addEventListener('activate', event => {
  console.log('SW: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('SW: Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch: serve from cache first, fall back to network
self.addEventListener('fetch', event => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Never intercept cross-origin requests (Google Sign-In, Drive API,
  // webfonts) — those carry auth tokens or need to always hit the network,
  // and have no business going through our same-origin app-shell cache.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        // Don't cache non-successful responses
        if (!networkResponse.ok) {
          return networkResponse;
        }

        // Clone the response for caching
        const responseToCache = networkResponse.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(error => {
        console.error('SW: Fetch failed:', error);
        // Could return a fallback page here for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw error;
      });
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
