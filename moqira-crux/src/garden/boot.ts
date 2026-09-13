// Runs before Moqira's main.tsx (see index.html): the app checks for Tauri
// through window.__TAURI_INTERNALS__, and the Garden stands in for it.
import { attach, edition, embedded } from './bridge';
if (embedded || edition) window.__TAURI_INTERNALS__ = { garden: true };
// Once the app has rendered its title bar, mount the Garden bar and watch the save state.
const start = () => {
  const found = document.querySelector('.app-shell');
  if (found) void attach();
  else requestAnimationFrame(start);
};
if (embedded || edition) start();
