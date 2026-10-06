/**
 * Retire the app-origin virtual file server. Published HTML now requires a
 * separate publishing origin. Keep this worker so existing cached URLs cannot
 * execute with access to the app's DOM, cookies or storage (ADR 0061).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/__preview/')) return;
  event.respondWith(
    new Response('This preview has moved. Open the creation on its publishing site.', {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    }),
  );
});
