export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

export function initOfflineDetection() {
  const ribbon = document.getElementById('offlineRibbon');
  if (!ribbon) return;

  function update() {
    ribbon.classList.toggle('visible', !navigator.onLine);
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

export function initInstallPrompt() {
  const banner = document.getElementById('installBanner');
  const installBtn = document.getElementById('btnInstall');
  const dismissBtn = document.getElementById('btnDismiss');
  if (!banner || !installBtn || !dismissBtn) return;

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    banner.classList.add('visible');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.classList.remove('visible');
  });

  dismissBtn.addEventListener('click', () => {
    banner.classList.remove('visible');
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    banner.classList.remove('visible');
    deferredPrompt = null;
  });
}
