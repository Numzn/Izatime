import {
  mutate, exportJSON, importJSON, resetAll, getGoogleClientId, setGoogleClientId, isDefaultGoogleClientId, getCurrentAccount, getKnownAccounts, forgetAccount,
} from '../core/store.js';
import * as notifications from '../services/notifications.js';
import { importTimetableCSV, CSV_TEMPLATE } from '../services/csvImport.js';
import { buildICS } from '../services/icsExport.js';
import * as googleSync from '../services/googleSync.js';
import { delegate, escapeHtml } from '../components/dom.js';
import { confirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { iconMarkup } from '../components/icons.js';

let unsubscribeSync = null;
const viewState = { editingClientId: false };

function permissionText() {
  if (!notifications.isSupported()) return 'Not supported on this device';
  const p = notifications.permissionState();
  if (p === 'granted') return 'Allowed';
  if (p === 'denied') return 'Blocked — enable in browser settings';
  return 'Not requested yet';
}

function relativeTime(iso) {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function accountSyncSection(state) {
  const clientId = getGoogleClientId();
  const currentAccount = getCurrentAccount();
  const connected = googleSync.isConnected();
  const knownAccounts = getKnownAccounts().filter((a) => a.sub !== currentAccount?.sub);

  if (viewState.editingClientId) {
    return `
      <section class="dash-section">
        <h2>Account &amp; sync</h2>
        <p class="settings-note">${isDefaultGoogleClientId() ? "Syncing already works with this app's built-in Client ID. Only change this if you've deployed your own fork with its own Google Cloud project — see the README." : 'Using a custom Google OAuth Client ID.'}</p>
        <label class="form-field"><span>Google OAuth Client ID</span><input type="text" id="setClientId" placeholder="xxxxxxxx.apps.googleusercontent.com" value="${escapeHtml(isDefaultGoogleClientId() ? '' : clientId)}"></label>
        <div class="settings-actions">
          <button class="btn btn-primary" data-action="save-client-id">Save Client ID</button>
          <button class="btn btn-ghost" data-action="cancel-client-id">Cancel</button>
        </div>
      </section>`;
  }

  let statusBlock;
  if (connected) {
    statusBlock = `
      <div class="account-row">
        ${currentAccount?.picture ? `<img class="account-avatar" src="${escapeHtml(currentAccount.picture)}" alt="">` : `<span class="account-avatar account-avatar-fallback">${escapeHtml((currentAccount?.name || '?')[0])}</span>`}
        <span class="account-info">
          <span class="account-name">${escapeHtml(currentAccount?.name || 'Signed in')}</span>
          <span class="account-email">${escapeHtml(currentAccount?.email || '')}</span>
        </span>
      </div>
      <p class="settings-note">Synced ${relativeTime(googleSync.getLastSyncedAt())}</p>
      <div class="settings-actions">
        <button class="btn btn-ghost" data-action="sync-now">${iconMarkup('repeat', { size: 15 })}Sync now</button>
        <button class="btn btn-ghost" data-action="sign-out">Sign out</button>
      </div>`;
  } else if (currentAccount) {
    statusBlock = `
      <div class="account-row">
        ${currentAccount.picture ? `<img class="account-avatar" src="${escapeHtml(currentAccount.picture)}" alt="">` : `<span class="account-avatar account-avatar-fallback">${escapeHtml((currentAccount.name || '?')[0])}</span>`}
        <span class="account-info">
          <span class="account-name">${escapeHtml(currentAccount.name || 'Signed in')}</span>
          <span class="account-email">Sync paused — sign in again to resume</span>
        </span>
      </div>
      <div class="settings-actions">
        <button class="btn btn-primary" data-action="resume-sync">Resume sync</button>
      </div>`;
  } else {
    statusBlock = `
      <p class="settings-note">Not signed in — this timetable only lives on this device.</p>
      <div class="settings-actions">
        <button class="btn btn-primary" data-action="sign-in">${iconMarkup('upload', { size: 15 })}Sign in with Google</button>
      </div>`;
  }

  return `
    <section class="dash-section">
      <h2>Account &amp; sync</h2>
      ${statusBlock}
      <button class="link-btn" data-action="switch-account">Sign in with a different Google account</button>
      ${knownAccounts.length ? `
        <p class="settings-note">Other accounts used on this device:</p>
        <div class="account-list">
          ${knownAccounts.map((a) => `
            <div class="account-row account-row-compact">
              <span class="account-name">${escapeHtml(a.name)}</span>
              <button class="link-btn" data-action="forget-account" data-sub="${escapeHtml(a.sub)}">Forget</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <button class="link-btn" data-action="edit-client-id">Change Client ID</button>
    </section>`;
}

export function destroy() {
  unsubscribeSync?.();
  unsubscribeSync = null;
}

export function render(container, { state, navigate }) {
  destroy();
  const { settings } = state;

  container.innerHTML = `
    ${accountSyncSection(state)}

    <section class="dash-section">
      <h2>Daily goal</h2>
      <label class="form-field">
        <span>Study minutes per day</span>
        <input type="number" id="setGoal" min="10" step="5" value="${settings.dailyGoalMinutes}">
      </label>
    </section>

    <section class="dash-section">
      <h2>Focus timer</h2>
      <div class="settings-grid">
        <label class="form-field"><span>Focus (min)</span><input type="number" id="setFocus" min="5" step="5" value="${settings.focusMinutes}"></label>
        <label class="form-field"><span>Break (min)</span><input type="number" id="setBreak" min="1" step="1" value="${settings.breakMinutes}"></label>
        <label class="form-field"><span>Long break (min)</span><input type="number" id="setLongBreak" min="5" step="5" value="${settings.longBreakMinutes}"></label>
        <label class="form-field"><span>Sessions before long break</span><input type="number" id="setCycles" min="2" step="1" value="${settings.sessionsBeforeLongBreak}"></label>
      </div>
    </section>

    <section class="dash-section">
      <h2>Notifications</h2>
      <label class="form-field-inline">
        <input type="checkbox" id="setNotify" ${settings.notificationsEnabled ? 'checked' : ''}>
        <span>Smart reminders (max 3/day, quiet hours respected)</span>
      </label>
      <p class="settings-note">Status: ${permissionText()}</p>
      <div class="settings-grid">
        <label class="form-field"><span>Quiet hours start</span><input type="time" id="setQuietStart" value="${settings.quietHours.start}"></label>
        <label class="form-field"><span>Quiet hours end</span><input type="time" id="setQuietEnd" value="${settings.quietHours.end}"></label>
      </div>
    </section>

    <section class="dash-section">
      <h2>Appearance</h2>
      <label class="form-field">
        <span>Theme</span>
        <select id="setTheme">
          <option value="system" ${settings.theme === 'system' ? 'selected' : ''}>Match device</option>
          <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select>
      </label>
    </section>

    <section class="dash-section">
      <h2>Timetable import</h2>
      <p class="settings-note">Add classes in bulk from a spreadsheet. Columns: subject, title, day (MON..SUN), startTime (HH:MM), durationMinutes, lecturer, type, priority — only subject/title/day/startTime are required.</p>
      <div class="settings-actions">
        <button class="btn btn-ghost" data-action="csv-template">${iconMarkup('download', { size: 15 })}Download CSV template</button>
        <button class="btn btn-ghost" data-action="csv-import">${iconMarkup('upload', { size: 15 })}Import timetable CSV</button>
      </div>
      <input type="file" id="importCsvFile" accept=".csv,text/csv" style="display:none">
    </section>

    <section class="dash-section">
      <h2>Calendar sync</h2>
      <p class="settings-note">Download classes, assignments, and assessments as a calendar file, then import it into Google Calendar, Apple Calendar, or Outlook for reminders this app can't send in the background. Re-download and re-import any time to bring it up to date.</p>
      <div class="settings-actions">
        <button class="btn btn-ghost" data-action="ics-export">${iconMarkup('download', { size: 15 })}Download calendar (.ics)</button>
      </div>
    </section>

    <section class="dash-section">
      <h2>Your data</h2>
      <p class="settings-note">Everything is stored on this device only. Export a backup regularly.</p>
      <div class="settings-actions">
        <button class="btn btn-ghost" data-action="export">${iconMarkup('download', { size: 15 })}Export backup</button>
        <button class="btn btn-ghost" data-action="import">${iconMarkup('upload', { size: 15 })}Import backup</button>
        <button class="btn btn-danger" data-action="reset">Reset all data</button>
      </div>
      <input type="file" id="importFile" accept="application/json" style="display:none">
    </section>
  `;

  unsubscribeSync = googleSync.onStatusChange((status) => {
    if (status.needsReauth) showToast('Session expired — sign in again to resume syncing');
    render(container, { state, navigate });
  });

  container.querySelector('#setClientId')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') container.querySelector('[data-action="save-client-id"]')?.click();
  });

  delegate(container, 'click', '[data-action="save-client-id"]', () => {
    const value = container.querySelector('#setClientId').value.trim();
    setGoogleClientId(value);
    viewState.editingClientId = false;
    showToast(value ? 'Custom Client ID saved' : 'Reverted to the built-in Client ID');
    render(container, { state, navigate });
  });

  delegate(container, 'click', '[data-action="cancel-client-id"]', () => {
    viewState.editingClientId = false;
    render(container, { state, navigate });
  });

  delegate(container, 'click', '[data-action="edit-client-id"]', () => {
    viewState.editingClientId = true;
    render(container, { state, navigate });
  });

  delegate(container, 'click', '[data-action="sign-in"], [data-action="switch-account"], [data-action="resume-sync"]', async (event, target) => {
    const selectAccount = target.dataset.action === 'switch-account';
    try {
      showToast('Opening Google sign-in…');
      const profile = await googleSync.signIn({ selectAccount });
      showToast(`Signed in as ${profile.name}`);
    } catch (error) {
      showToast(error.message || 'Sign-in failed');
    }
    render(container, { state, navigate });
  });

  delegate(container, 'click', '[data-action="sign-out"]', () => {
    googleSync.signOut();
    showToast('Signed out — back to local storage');
    render(container, { state, navigate });
  });

  delegate(container, 'click', '[data-action="sync-now"]', async () => {
    try {
      await googleSync.syncNow();
      showToast('Synced');
    } catch (error) {
      showToast('Sync failed');
    }
    render(container, { state, navigate });
  });

  delegate(container, 'click', '[data-action="forget-account"]', async (event, target) => {
    const ok = await confirmModal({ message: 'Remove this account and its cached data from this device? Anything already synced to Drive is untouched.' });
    if (!ok) return;
    forgetAccount(target.dataset.sub);
    render(container, { state, navigate });
  });

  container.querySelector('#setGoal').addEventListener('change', (e) => {
    mutate((s) => { s.settings.dailyGoalMinutes = Math.max(10, Number(e.target.value) || 60); });
  });
  container.querySelector('#setFocus').addEventListener('change', (e) => {
    mutate((s) => { s.settings.focusMinutes = Math.max(5, Number(e.target.value) || 25); });
  });
  container.querySelector('#setBreak').addEventListener('change', (e) => {
    mutate((s) => { s.settings.breakMinutes = Math.max(1, Number(e.target.value) || 5); });
  });
  container.querySelector('#setLongBreak').addEventListener('change', (e) => {
    mutate((s) => { s.settings.longBreakMinutes = Math.max(5, Number(e.target.value) || 15); });
  });
  container.querySelector('#setCycles').addEventListener('change', (e) => {
    mutate((s) => { s.settings.sessionsBeforeLongBreak = Math.max(2, Number(e.target.value) || 4); });
  });
  container.querySelector('#setQuietStart').addEventListener('change', (e) => {
    mutate((s) => { s.settings.quietHours.start = e.target.value; });
  });
  container.querySelector('#setQuietEnd').addEventListener('change', (e) => {
    mutate((s) => { s.settings.quietHours.end = e.target.value; });
  });
  container.querySelector('#setTheme').addEventListener('change', (e) => {
    mutate((s) => { s.settings.theme = e.target.value; });
  });

  container.querySelector('#setNotify').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const result = await notifications.requestPermission();
      if (result !== 'granted') {
        e.target.checked = false;
        showToast('Notifications were not allowed');
        return;
      }
    }
    mutate((s) => { s.settings.notificationsEnabled = e.target.checked; });
  });

  delegate(container, 'click', '[data-action="csv-template"]', () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timetable-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  delegate(container, 'click', '[data-action="csv-import"]', () => container.querySelector('#importCsvFile').click());
  container.querySelector('#importCsvFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let result;
      mutate((s) => { result = importTimetableCSV(s, text); });
      if (result.imported > 0) {
        showToast(`Imported ${result.imported} class${result.imported === 1 ? '' : 'es'}${result.subjectsCreated ? `, ${result.subjectsCreated} new subject${result.subjectsCreated === 1 ? '' : 's'}` : ''}${result.skipped.length ? ` — ${result.skipped.length} row${result.skipped.length === 1 ? '' : 's'} skipped` : ''}`);
      } else {
        showToast('No valid rows found in that CSV');
      }
      if (result.skipped.length) console.warn('CSV import skipped rows:', result.skipped);
    } catch (error) {
      showToast('Could not read that CSV file');
    }
    e.target.value = '';
  });

  delegate(container, 'click', '[data-action="ics-export"]', () => {
    const blob = new Blob([buildICS(state)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'digital-timetable.ics';
    a.click();
    URL.revokeObjectURL(url);
  });

  delegate(container, 'click', '[data-action="export"]', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `izatime-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  delegate(container, 'click', '[data-action="import"]', () => container.querySelector('#importFile').click());
  container.querySelector('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      importJSON(text);
      showToast('Backup restored');
    } catch (error) {
      showToast('Could not read that backup file');
    }
    e.target.value = '';
  });

  delegate(container, 'click', '[data-action="reset"]', async () => {
    const ok = await confirmModal({
      title: 'Reset everything?',
      message: 'This deletes all subjects, sessions, notes, flashcards, and progress on this device. Export a backup first if you want to keep it.',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    resetAll();
    showToast('All data cleared');
    navigate('dashboard');
  });
}
