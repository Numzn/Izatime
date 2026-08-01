const STROKE_PATHS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>',
  book: '<path d="M4 5.5A2 2 0 0 1 6 4h6v16H6a2 2 0 0 0-2 1.5z"/><path d="M20 5.5A2 2 0 0 0 18 4h-6v16h6a2 2 0 0 1 2 1.5z"/>',
  notebook: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18"/><path d="M12 8h5M12 12h5M12 16h3"/>',
  'trending-up': '<path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/>',
  'trending-down': '<path d="M4 8l6 6 4-4 6 7"/><path d="M15 17h5v-5"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9 6.3 6.3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 16.5V20h3.5L18.4 9.1l-3.5-3.5z"/><path d="M13.5 4.5l3.5 3.5"/>',
  trash: '<path d="M5 7h14"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  download: '<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 18.5h14"/>',
  upload: '<path d="M12 18V8"/><path d="M8 12l4-4 4 4"/><path d="M5 18.5h14"/>',
  flame: '<path d="M12 3s4 3.6 4 8a4 4 0 0 1-8 0c0-1 .4-1.9 1-2.6.1 1.1.8 1.9 1.6 1.9-.6-2.1 1.4-3.4 1.4-5.5v-1.8z"/><path d="M9.2 14.8a2.8 2.8 0 0 0 5.6 0"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  layers: '<path d="M12 3l8 4.5-8 4.5-8-4.5z"/><path d="M4 12l8 4.5 8-4.5"/><path d="M4 16.5 12 21l8-4.5"/>',
  'help-circle': '<circle cx="12" cy="12" r="8.3"/><path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.2 1-1.2 1.9"/><circle cx="12" cy="16.8" r="0.55" fill="currentColor"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z"/><path d="M10 18a2 2 0 0 0 4 0"/>',
  'alert-triangle': '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.3"/><circle cx="12" cy="17.2" r="0.55" fill="currentColor"/>',
  'wifi-off': '<path d="M2 2l20 20"/><path d="M3 9c1.8-1.6 4-2.7 6.3-3.2M14.7 5.8A13 13 0 0 1 21 9M6.3 12.8a8.5 8.5 0 0 1 3-1.7M17.7 12.8a8.5 8.5 0 0 0-2-1.4M9.5 16.3a4 4 0 0 1 5 0"/><circle cx="12" cy="19.5" r="0.55" fill="currentColor"/>',
  lightbulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M7 9a5 5 0 1 1 10 0c0 2-1 3-2 4.2-.5.6-.8 1.2-.8 1.8H9.8c0-.6-.3-1.2-.8-1.8C8 12 7 11 7 9z"/>',
  'graduation-cap': '<path d="M12 4 2 8.5 12 13l10-4.5z"/><path d="M6 11v4.5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5V11"/><path d="M22 8.5v5"/>',
  'file-text': '<path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4"/><path d="M9 13h6M9 16.5h6"/>',
  hourglass: '<path d="M7 3h10"/><path d="M7 21h10"/><path d="M7 3c0 4 3 5.3 5 6.5-2 1.2-5 2.5-5 6.5"/><path d="M17 3c0 4-3 5.3-5 6.5 2 1.2 5 2.5 5 6.5"/>',
  pin: '<path d="M12 2.5a5 5 0 0 1 5 5c0 3.5-5 10-5 10s-5-6.5-5-10a5 5 0 0 1 5-5z"/><circle cx="12" cy="7.5" r="1.8"/>',
  repeat: '<path d="M4 7h13l-3-3"/><path d="M20 17H7l3 3"/>',
};

const FILL_PATHS = {
  spark: '<path d="M12 2c.7 4.1 2.7 6.1 6.8 6.8-4.1.7-6.1 2.7-6.8 6.8-.7-4.1-2.7-6.1-6.8-6.8C9.3 8.1 11.3 6.1 12 2z"/>',
};

export function iconMarkup(name, { size = 20, strokeWidth = 1.75 } = {}) {
  if (FILL_PATHS[name]) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="icon icon-${name}">${FILL_PATHS[name]}</svg>`;
  }
  const path = STROKE_PATHS[name];
  if (!path) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="icon icon-${name}">${path}</svg>`;
}
