/**
 * preview-sw.js — Virtual file server for workspace HTML preview.
 *
 * This service worker intercepts fetch requests to /__preview/{cruxId}/{path}
 * and serves files from the browser's Cache API. The main thread (previewCache.ts)
 * writes artifact blobs to the cache; this SW reads and serves them.
 *
 * URL pattern: /__preview/{cruxId}/{normalizedFilePath}
 * Cache name:  crux-preview-{cruxId}
 *
 * All non-preview requests pass through untouched — React Router, API calls,
 * fonts, static assets are completely unaffected.
 *
 * See: src/lib/PREVIEW-SYSTEM.md for full architecture documentation.
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
 * The main thread stores files via cache.put(pathname, Response) in previewCache.ts.
 * We match by pathname (the full /__preview/{cruxId}/{path} string) which is the
 * same key format used by both the writer and reader.
 *
 * @param {string} pathname - e.g. "/__preview/abc-123/images/logo.png"
 * @returns {Promise<Response>}
 */
async function handlePreviewRequest(pathname) {
  // Parse cruxId from: /__preview/{cruxId}/{...filePath}
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
