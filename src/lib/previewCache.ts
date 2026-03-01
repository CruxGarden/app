/**
 * previewCache.ts — Client-side Cache API wrapper for the preview service worker.
 *
 * Writes artifact blobs into the browser's Cache API at virtual paths like
 * `/__preview/{cruxId}/images/logo.png`. The service worker (preview-sw.js)
 * reads from the same cache to serve files.
 *
 * Key insight: Cache API is shared between the main thread and the SW —
 * no postMessage needed.
 *
 * See: PREVIEW-SYSTEM.md for full architecture documentation.
 */

import { normalizePath } from '@/lib/rewriteUrls';

const PREVIEW_PREFIX = '/__preview/';

/** MIME types by file extension. */
const MIME_MAP: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  ts: 'application/javascript',
  tsx: 'application/javascript',
  jsx: 'application/javascript',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ── Public API ──────────────────────────────────────────

export interface PreviewFile {
  /** Virtual path, e.g. "images/logo.png" or "index.html" */
  path: string;
  /** File content */
  blob: Blob;
  /** Optional override — guessed from path extension if omitted */
  mimeType?: string;
}

/**
 * Cache all preview files for a crux. Clears any previous cache first.
 *
 * Each file is stored at `/__preview/{cruxId}/{normalizedPath}` — the same
 * URL pattern the service worker intercepts.
 */
export async function cachePreviewFiles(cruxId: string, files: PreviewFile[]): Promise<void> {
  const cacheName = `crux-preview-${cruxId}`;

  // Clear previous cache for this crux
  await caches.delete(cacheName);

  const cache = await caches.open(cacheName);

  await Promise.all(
    files.map((file) => {
      const norm = normalizePath(file.path);
      const url = `${PREVIEW_PREFIX}${cruxId}/${norm}`;
      const mime = file.mimeType || guessMime(norm);
      const response = new Response(file.blob, {
        headers: { 'Content-Type': mime },
      });
      return cache.put(url, response);
    }),
  );
}

/**
 * Update (or add) a single file in the cache without clearing other entries.
 * Used for hot-updating the current HTML file without re-downloading everything.
 */
export async function updatePreviewFile(cruxId: string, file: PreviewFile): Promise<void> {
  const cacheName = `crux-preview-${cruxId}`;
  const cache = await caches.open(cacheName);
  const norm = normalizePath(file.path);
  const url = `${PREVIEW_PREFIX}${cruxId}/${norm}`;
  const mime = file.mimeType || guessMime(norm);
  const response = new Response(file.blob, {
    headers: { 'Content-Type': mime },
  });
  await cache.put(url, response);
}

/**
 * Delete the preview cache for a crux.
 */
export async function clearPreviewCache(cruxId: string): Promise<void> {
  await caches.delete(`crux-preview-${cruxId}`);
}

/**
 * Get the preview URL for a file. Append `?v=N` to force iframe reload
 * (the SW uses exact pathname matching, ignoring query params).
 */
export function getPreviewUrl(cruxId: string, filePath: string, version?: number): string {
  const norm = normalizePath(filePath);
  const base = `${PREVIEW_PREFIX}${cruxId}/${norm}`;
  return version != null ? `${base}?v=${version}` : base;
}

/**
 * Wait for the preview service worker to be ready and controlling the page.
 * Returns false if service workers are not supported.
 */
export async function waitForServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const reg = await navigator.serviceWorker.ready;

    // If already controlling, we're good
    if (navigator.serviceWorker.controller) return true;

    // Wait for the SW to claim this client (with timeout)
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);

      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timeout);
          resolve(true);
        },
        { once: true },
      );

      // Double-check in case it happened between ready and listener
      if (navigator.serviceWorker.controller) {
        clearTimeout(timeout);
        resolve(true);
      }

      // If the SW is installed but hasn't claimed yet, it should
      // claim via clients.claim() in its activate handler
      void reg;
    });
  } catch {
    return false;
  }
}
