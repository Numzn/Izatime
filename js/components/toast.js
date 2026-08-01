let hideTimer = null;

export function showToast(message, { duration = 2400 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;

  root.textContent = message;
  root.classList.add('show');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => root.classList.remove('show'), duration);
}
