export const ROUTES = [
  { id: 'dashboard', label: 'Today', icon: '🏠' },
  { id: 'planner', label: 'Planner', icon: '🗓️' },
  { id: 'focus', label: 'Focus', icon: '🍅' },
  { id: 'hub', label: 'Hub', icon: '📚' },
  { id: 'progress', label: 'Progress', icon: '📈' },
];

export function renderNav(container, activeId, onNavigate) {
  container.innerHTML = '';
  ROUTES.forEach((route) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-btn${route.id === activeId ? ' active' : ''}`;
    btn.dataset.route = route.id;
    btn.innerHTML = `<span class="nav-icon">${route.icon}</span><span class="nav-label">${route.label}</span>`;
    btn.addEventListener('click', () => onNavigate(route.id));
    container.appendChild(btn);
  });
}
