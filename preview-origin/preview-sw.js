/**
 * preview-sw.js — Virtual file server for preview iframe.
 *
 * This service worker intercepts fetch requests to /__preview/{cruxId}/{path}
 * and serves files from the browser's Cache API. The receiver page (index.html)
 * writes files to the cache via postMessage from the parent app.
 *
 * Deployed to preview.crux.garden alongside index.html.
 * Identical logic to app/public/preview-sw.js.
 *
 * URL pattern: /__preview/{cruxId}/{normalizedFilePath}
 * Cache name:  crux-preview-{cruxId}
 */

const PREVIEW_PREFIX = '/__preview/';

// Activate immediately on install (don't wait for old SW to be released)
self.addEventListener('install', () => self.skipWaiting());

// Take control of all open tabs immediately (don't wait for navigation)
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Intercept fetch requests — only handle /__preview/ paths
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(PREVIEW_PREFIX)) return;

  event.respondWith(handlePreviewRequest(url.pathname));
});

/**
 * Look up a preview file in the Cache API.
 *
 * @param {string} pathname - e.g. "/__preview/abc-123/images/logo.png"
 * @returns {Promise<Response>}
 */
async function handlePreviewRequest(pathname) {
  const afterPrefix = pathname.slice(PREVIEW_PREFIX.length);
  const slashIdx = afterPrefix.indexOf('/');
  if (slashIdx === -1) {
    return new Response('Not found', { status: 404 });
  }

  const cruxId = afterPrefix.slice(0, slashIdx);
  const cacheName = 'crux-preview-' + cruxId;

  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(pathname);
    if (cached) return cached;
  } catch {
    // Cache API failure (e.g. storage full) — fall through to 404
  }

  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
  });
}
