// Runs before Tigrana's main.tsx (see index.html): inside a Crux the app runs
// in its browser mode with the Garden's NotebookStorage (src/lib/notebookStorage.ts
// picks it by this marker), and the Garden bar mounts once the app has rendered.
import { attach, embedded, garden } from './bridge';
if (embedded) {
  window.__CRUX_GARDEN__ = true;
  const start = () => {
    if (document.querySelector('#root > *')) void attach();
    else requestAnimationFrame(start);
  };
  start();
}
export { garden };
