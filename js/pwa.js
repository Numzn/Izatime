// PWA functionality: install prompt, offline detection, service worker
export function initPWA() {
  // Initialize in correct order
  registerServiceWorker();
  initOfflineDetection();
  initInstallPrompt();
}

// Service worker registration (call this early)
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => {
          console.log('SW registered successfully:', registration.scope);

          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content available, notify user
                  showUpdateNotification();
                }
              });
            }
          });
        })
        .catch(error => {
          console.warn('SW registration failed:', error);
        });
    });
  }
}

// Show update notification
function showUpdateNotification() {
  // Simple notification - could be enhanced with a proper UI
  if (confirm('New version available! Refresh to update?')) {
    window.location.reload();
  }
}

// Offline detection
function initOfflineDetection() {
  const ribbon = document.getElementById('offlineRibbon');
  if (!ribbon) {
    console.warn('Offline ribbon element not found');
    return;
  }

  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    ribbon.classList.toggle('visible', !isOnline);

    // Optional: Show toast notification
    if (!isOnline) {
      console.log('App is now offline');
    } else {
      console.log('App is back online');
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

// Install prompt
function initInstallPrompt() {
  const banner = document.getElementById('installBanner');
  const btnInstall = document.getElementById('btnInstall');
  const btnDismiss = document.getElementById('btnDismiss');

  if (!banner || !btnInstall || !btnDismiss) {
    console.warn('Install banner elements not found');
    return;
  }

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    // Prevent the default browser install prompt
    e.preventDefault();
    deferredPrompt = e;

    // Show our custom install banner
    banner.classList.add('visible');
    document.body.classList.add('banner-visible');

    console.log('Install prompt ready');
  });

  btnInstall.addEventListener('click', async () => {
    if (!deferredPrompt) {
      console.warn('No deferred prompt available');
      return;
    }

    try {
      // Show the install prompt
      deferredPrompt.prompt();

      // Wait for the user to respond
      const { outcome } = await deferredPrompt.userChoice;

      console.log('Install outcome:', outcome);

      // Reset the deferred prompt
      deferredPrompt = null;

      // Hide the banner
      banner.classList.remove('visible');
      document.body.classList.remove('banner-visible');

    } catch (error) {
      console.error('Install prompt error:', error);
    }
  });

  btnDismiss.addEventListener('click', () => {
    banner.classList.remove('visible');
    document.body.classList.remove('banner-visible');
    deferredPrompt = null;
    console.log('Install dismissed');
  });

  window.addEventListener('appinstalled', () => {
    banner.classList.remove('visible');
    document.body.classList.remove('banner-visible');
    deferredPrompt = null;
    console.log('App installed successfully');
  });
}