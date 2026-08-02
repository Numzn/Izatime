import { iconMarkup } from './icons.js';

// Only three peers in the bottom nav, on purpose: Today answers "what do I
// need to do," Timetable answers "what does my week look like," Subjects
// holds everything about one class. Focus and Progress are still reachable
// (see app.js's VIEWS map) but only as contextual destinations launched
// from within those three, never as nav-bar peers competing for attention.
export const ROUTES = [
  { id: 'dashboard', label: 'Today', icon: 'home' },
  { id: 'timetable', label: 'Timetable', icon: 'calendar' },
  { id: 'subjects', label: 'Subjects', icon: 'book' },
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
