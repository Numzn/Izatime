export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

// Tracks every listener delegate() has attached to a given root, so
// clearDelegated() can remove them all at once. Views call it at the top
// of render() — replacing a container's innerHTML detaches its old
// children (and their listeners) automatically, but a delegated listener
// lives on the container itself, which is the same persistent element
// across re-renders, so it survives innerHTML replacement. Without this,
// every re-render of a view that's already on screen (any store mutation
// while it's showing — not just navigating to it) stacks another listener
// on top of the last, each still closed over whatever `state` was current
// when it was registered.
const delegatedListeners = new WeakMap();

export function delegate(root, eventType, selector, handler) {
  const listener = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(eventType, listener);
  const unsubscribe = () => root.removeEventListener(eventType, listener);

  if (!delegatedListeners.has(root)) delegatedListeners.set(root, []);
  delegatedListeners.get(root).push(unsubscribe);

  return unsubscribe;
}

export function clearDelegated(root) {
  const listeners = delegatedListeners.get(root);
  if (!listeners) return;
  listeners.forEach((unsubscribe) => unsubscribe());
  delegatedListeners.set(root, []);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
