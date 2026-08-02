import { loadStore, getState, subscribe, getCurrentAccount } from './core/store.js';
import { renderNav, ROUTES } from './components/nav.js';
import { registerServiceWorker, initOfflineDetection, initInstallPrompt } from './pwa.js';
import * as notifications from './services/notifications.js';
import * as googleSync from './services/googleSync.js';
import { iconMarkup } from './components/icons.js';
import { escapeHtml } from './components/dom.js';

import * as dashboard from './views/dashboard.js';
import * as planner from './views/planner.js';
import * as focus from './views/focus.js';
import * as hub from './views/learningHub.js';
import * as analyticsView from './views/analyticsView.js';
import * as settings from './views/settings.js';

const VIEWS = {
  dashboard, planner, focus, hub, progress: analyticsView, settings,
};

let currentRoute = 'dashboard';
let currentParams = {};
let currentModule = null;

let viewRoot;
let navRoot;

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

function updateAccountIndicator(syncExtra = {}) {
  const btn = document.getElementById('accountIndicator');
  if (!btn) return;
  const account = getCurrentAccount();
  if (!account) { btn.style.display = 'none'; return; }
  btn.style.display = '';

  const connected = googleSync.isConnected();
  const syncing = !!syncExtra.syncing;
  const hasError = !!syncExtra.error || !!syncExtra.needsReauth;

  let statusWord = 'Not syncing';
  let dotClass = 'sync-dot-off';
  if (syncing) { statusWord = 'Syncing…'; dotClass = 'sync-dot-syncing'; } else if (hasError) { statusWord = syncExtra.needsReauth ? 'Sign in again to resume syncing' : 'Sync error'; dotClass = 'sync-dot-error'; } else if (connected) { statusWord = 'Synced'; dotClass = 'sync-dot-ok'; }

  btn.title = `${account.email ? `${account.name} · ${account.email}` : account.name} — ${statusWord}`;
  const avatar = account.picture
    ? `<img src="${escapeHtml(account.picture)}" alt="">`
    : escapeHtml((account.name || '?')[0]);
  btn.innerHTML = `${avatar}<span class="sync-dot ${dotClass}"></span>`;
}

function renderCurrentView() {
  const state = getState();
  applyTheme(state.settings.theme);
  updateAccountIndicator();

  const nextModule = VIEWS[currentRoute] || dashboard;
  if (currentModule && currentModule !== nextModule) currentModule.destroy?.();
  currentModule = nextModule;

  try {
    nextModule.render(viewRoot, { state, params: currentParams, navigate });
  } catch (error) {
    console.error(`Failed to render view "${currentRoute}":`, error);
    viewRoot.innerHTML = `<div class="empty-state">${iconMarkup('alert-triangle', { size: 22 })}<p>This screen hit a snag. Try another tab.</p></div>`;
  }

  renderNav(navRoot, ROUTES.some((r) => r.id === currentRoute) ? currentRoute : null, navigate);
}

function navigate(routeId, params = {}) {
  if (!VIEWS[routeId]) return;
  currentRoute = routeId;
  currentParams = params;
  viewRoot.scrollTo?.({ top: 0 });
  renderCurrentView();
}

function initSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  setTimeout(() => splash.classList.add('hidden'), 700);
}

function initHeader() {
  document.getElementById('btnSettings')?.addEventListener('click', () => navigate('settings'));
  document.getElementById('accountIndicator')?.addEventListener('click', () => navigate('settings'));
}

function startNotificationLoop() {
  setInterval(() => {
    try {
      notifications.tick();
    } catch (error) {
      console.warn('Notification check failed:', error);
    }
  }, 60000);
}

function initApp() {
  try {
    loadStore();
    viewRoot = document.getElementById('view-root');
    navRoot = document.getElementById('bottomNav');

    if (!viewRoot || !navRoot) throw new Error('App shell elements missing');

    initHeader();
    initSplash();
    registerServiceWorker();
    initOfflineDetection();
    initInstallPrompt();
    startNotificationLoop();

    subscribe(() => renderCurrentView());
    googleSync.onStatusChange((status) => updateAccountIndicator(status));
    navigate('dashboard');
  } catch (error) {
    console.error('App failed to start:', error);
    document.body.innerHTML = `
      <div class="fatal-error">
        <h2>${iconMarkup('alert-triangle', { size: 20 })}Digital Timetable couldn't start</h2>
        <p>Please refresh the page. Your saved data is untouched.</p>
        <button onclick="location.reload()">Refresh</button>
      </div>`;
  }
}

window.addEventListener('error', (event) => console.error('Global error:', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => console.error('Unhandled rejection:', event.reason));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
