// Main application initialization
import { initDOM, initClock, initDayChips, renderTimetable, initEventHandlers, initSplash } from './ui.js';
import { initPWA } from './pwa.js';

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  // Could show user-friendly error message here
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Initialize the application
function initApp() {
  try {
    console.log('Initializing Iza:time app...');

    // Initialize in correct order
    initDOM();
    initSplash();
    initClock();
    initDayChips();
    initEventHandlers();
    renderTimetable(); // Initial render
    initPWA();

    console.log('App initialized successfully');

  } catch (error) {
    console.error('App initialization failed:', error);

    // Show error to user
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #ff6b6b;
      color: white;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      z-index: 10000;
      font-family: 'Sora', sans-serif;
      max-width: 300px;
    `;
    errorMsg.innerHTML = `
      <h3>⚠️ App Error</h3>
      <p>Failed to load the app. Please refresh the page.</p>
      <button onclick="location.reload()" style="
        background: white;
        color: #ff6b6b;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        margin-top: 10px;
        cursor: pointer;
        font-weight: 600;
      ">Refresh</button>
    `;
    document.body.appendChild(errorMsg);
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}