import { clear } from './dom.js';

let activeClose = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.classList.remove('active');
  clear(root);
  activeClose = null;
}

export function openModal({
  title, bodyNode, actions = [], onClose,
} = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return () => {};

  if (activeClose) activeClose();
  clear(root);

  const card = document.createElement('div');
  card.className = 'modal-card';

  const heading = document.createElement('h3');
  heading.className = 'modal-title';
  heading.textContent = title;
  card.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (bodyNode) body.appendChild(bodyNode);
  card.appendChild(body);

  if (actions.length) {
    const actionsRow = document.createElement('div');
    actionsRow.className = 'modal-actions';
    actions.forEach((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${action.variant === 'danger' ? 'btn-danger' : action.variant === 'primary' ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = action.label;
      // Action buttons resolve the interaction themselves, so they get the
      // plain closer — only backdrop/Escape dismissal should fire onClose.
      btn.addEventListener('click', () => action.onClick?.(closeUI));
      actionsRow.appendChild(btn);
    });
    card.appendChild(actionsRow);
  }

  root.appendChild(card);
  root.classList.add('active');

  function backdropHandler(event) {
    if (event.target === root) dismiss();
  }
  function escHandler(event) {
    if (event.key === 'Escape') dismiss();
  }

  function closeUI() {
    root.removeEventListener('click', backdropHandler);
    document.removeEventListener('keydown', escHandler);
    closeModal();
  }

  function dismiss() {
    closeUI();
    onClose?.();
  }

  root.addEventListener('click', backdropHandler);
  document.addEventListener('keydown', escHandler);
  activeClose = dismiss;

  return closeUI;
}

export function confirmModal({
  title = 'Are you sure?', message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true,
} = {}) {
  return new Promise((resolve) => {
    const body = document.createElement('p');
    body.className = 'modal-message';
    body.textContent = message;

    openModal({
      title,
      bodyNode: body,
      actions: [
        { label: cancelLabel, variant: 'ghost', onClick: (close) => { close(); resolve(false); } },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: (close) => { close(); resolve(true); } },
      ],
      onClose: () => resolve(false),
    });
  });
}
