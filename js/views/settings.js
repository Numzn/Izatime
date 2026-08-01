import { mutate, exportJSON, importJSON, resetAll } from '../core/store.js';
import * as notifications from '../services/notifications.js';
import { delegate } from '../components/dom.js';
import { confirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

function permissionText() {
  if (!notifications.isSupported()) return 'Not supported on this device';
  const p = notifications.permissionState();
  if (p === 'granted') return 'Allowed';
  if (p === 'denied') return 'Blocked — enable in browser settings';
  return 'Not requested yet';
}

export function render(container, { state, navigate }) {
  const { settings } = state;

  container.innerHTML = `
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
      <h2>Your data</h2>
      <p class="settings-note">Everything is stored on this device only. Export a backup regularly.</p>
      <div class="settings-actions">
        <button class="btn btn-ghost" data-action="export">⬇ Export backup</button>
        <button class="btn btn-ghost" data-action="import">⬆ Import backup</button>
        <button class="btn btn-danger" data-action="reset">Reset all data</button>
      </div>
      <input type="file" id="importFile" accept="application/json" style="display:none">
    </section>
  `;

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
