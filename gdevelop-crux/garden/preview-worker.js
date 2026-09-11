// Generated games and function code only. No durable user data or network cache.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const prefix = new URL('./browser_sw_preview', self.location.href).pathname;
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(prefix + '/')) return;
  event.respondWith(new Promise(resolve => {
    const request = indexedDB.open('gdevelop-browser-sw-preview', 2);
    request.onupgradeneeded = () => {
      for (const name of ['files', 'instances']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onerror = () => resolve(new Response('Preview cache unavailable', { status: 503 }));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('files', 'readonly');
      const read = transaction.objectStore('files').get(url.pathname.slice(prefix.length));
      read.onsuccess = () => resolve(read.result ? new Response(read.result.bytes, { headers: { 'Content-Type': read.result.contentType || 'application/octet-stream', 'Cache-Control': 'no-store' } }) : new Response('Preview file missing', { status: 404 }));
      read.onerror = () => resolve(new Response('Preview cache read failed', { status: 503 }));
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => db.close();
    };
  }));
});
