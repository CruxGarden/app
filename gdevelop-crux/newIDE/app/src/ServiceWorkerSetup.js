// @flow
// Garden keeps only generated preview data in this native preview cache.
// Artifacts remain the source of truth; the worker does not cache the editor.
let registrationPromise = null;
export function isServiceWorkerSupported() { return !!navigator.serviceWorker; }
export function registerServiceWorker() {
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    if (!navigator.serviceWorker) throw new Error('Local game preview needs service worker support.');
    await navigator.serviceWorker.register(new URL('./service-worker.js', document.baseURI).href);
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  })();
  return registrationPromise;
}
