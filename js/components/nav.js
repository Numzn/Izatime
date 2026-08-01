import { iconMarkup } from './icons.js';

export const ROUTES = [
  { id: 'dashboard', label: 'Today', icon: 'home' },
  { id: 'planner', label: 'Planner', icon: 'calendar' },
  { id: 'focus', label: 'Focus', icon: 'timer' },
  { id: 'hub', label: 'Hub', icon: 'book' },
  { id: 'progress', label: 'Progress', icon: 'trending-up' },
];

export function renderNav(container, activeId, onNavigate) {
  container.innerHTML = '';
  ROUTES.forEach((route) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-btn${route.id === activeId ? ' active' : ''}`;
    btn.dataset.route = route.id;
    btn.innerHTML = `${iconMarkup(route.icon, { size: 19 })}<span class="nav-label">${route.label}</span>`;
    btn.addEventListener('click', () => onNavigate(route.id));
    container.appendChild(btn);
  });
}
