/**
 * previewCache.ts — Preview file caching for the service worker preview system.
 *
 * Two modes of operation:
 *
 * 1. **Same-origin** (no VITE_PREVIEW_ORIGIN) — Writes directly to the Cache API.
 *    The SW on the same origin reads from the same cache. Simple, no isolation.
 *
 * 2. **Cross-origin** (VITE_PREVIEW_ORIGIN set) — Sends files via postMessage to a
 *    hidden receiver iframe on preview.crux.garden. The receiver writes to the Cache
 *    API on its own origin, and its SW serves the files. Full storage isolation.
 *
 * The public API is identical in both modes. Consumers don't need to know which
 * mode is active.
 *
 * See: PREVIEW-SYSTEM.md and PREVIEW-ORIGIN-PLAN.md for architecture docs.
 */

import { normalizePath } from '@/lib/rewriteUrls';

const PREVIEW_PREFIX = '/__preview/';
const PREVIEW_ORIGIN = import.meta.env.VITE_PREVIEW_ORIGIN || '';

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

// ── Cross-origin receiver iframe management ─────────────

let receiverIframe: HTMLIFrameElement | null = null;
let receiverReady: Promise<void> | null = null;
let resolveReceiverReady: (() => void) | null = null;

/**
 * Initialize the hidden receiver iframe on the preview origin.
 * Called once from main.tsx when VITE_PREVIEW_ORIGIN is set.
 */
export function initPreviewReceiver(): void {
  if (!PREVIEW_ORIGIN || receiverIframe) return;

  receiverReady = new Promise<void>((resolve) => {
    resolveReceiverReady = resolve;
  });

  window.addEventListener('message', (e) => {
    if (e.origin !== PREVIEW_ORIGIN) return;
    if (e.data?.type === 'crux:preview-ready') {
      resolveReceiverReady?.();
    }
  });

  receiverIframe = document.createElement('iframe');
  receiverIframe.src = PREVIEW_ORIGIN;
  receiverIframe.style.display = 'none';
  receiverIframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(receiverIframe);
}

/** Wait for the receiver iframe to be ready. */
async function waitForReceiver(): Promise<boolean> {
  if (!receiverReady) return false;
  const timeout = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), 5000),
  );
  const result = await Promise.race([receiverReady.then(() => 'ready' as const), timeout]);
  return result === 'ready';
}

/** Send a message to the receiver iframe and wait for a specific response. */
function postToReceiver(
  message: Record<string, unknown>,
  transferables: Transferable[],
  responseType: string,
  matchKey?: { key: string; value: string },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`Preview receiver timeout waiting for ${responseType}`));
    }, 10000);

    function handler(e: MessageEvent) {
      if (e.origin !== PREVIEW_ORIGIN) return;
      if (e.data?.type !== responseType) return;
      if (matchKey && e.data[matchKey.key] !== matchKey.value) return;
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve();
    }

    window.addEventListener('message', handler);
    receiverIframe!.contentWindow!.postMessage(message, PREVIEW_ORIGIN, transferables);
  });
}

// ── SPA injection (mirrors publish-injections.ts) ───────

/**
 * Inject SPA-aware scripts into an HTML string before caching.
 * Only applied when the crux is a webapp (explicit kind or auto-detected
 * from having an index.html). Mirrors the server's publish injections:
 *   - Sets window.__CRUX_BASENAME__ so React Router / Vue Router / etc. work
 *   - Strips /index.html from the URL so routers see "/"
 *   - Syncs navigation events to the parent frame via postMessage
 *
 * @param html     — raw HTML content
 * @param cruxId   — crux ID (used to compute the preview basename)
 * @param isWebApp — true if the crux is a webapp (caller determines this)
 * @returns HTML with injected scripts, or original HTML if not a webapp
 */
export function injectPreviewScripts(html: string, cruxId: string, isWebApp: boolean): string {
  if (!isWebApp) return html;

  const basename = `${PREVIEW_PREFIX}${cruxId}`;

  const script = `<script data-crux-inject>
(function(){
  var base="${basename}";
  window.__CRUX_BASENAME__=base;
  if(location.pathname.endsWith('/index.html')){
    history.replaceState(null,'',location.pathname.replace(/\\/index\\.html$/,'/'));
  }
  if(window.parent!==window){
    function notify(){
      var path=location.pathname;
      if(base&&path.indexOf(base)===0)path=path.slice(base.length)||'/';
      window.parent.postMessage({type:'crux:navigate',path:path},'*');
    }
    var OP=history.pushState,OR=history.replaceState;
    history.pushState=function(){OP.apply(this,arguments);notify();};
    history.replaceState=function(){OR.apply(this,arguments);notify();};
    window.addEventListener('popstate',notify);
    notify();
  }
})();
</script>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}\n</head>`);
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${script}\n</body>`);
  }
  return html + `\n${script}`;
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
 */
export async function cachePreviewFiles(cruxId: string, files: PreviewFile[]): Promise<void> {
  if (PREVIEW_ORIGIN) {
    return cachePreviewFilesCrossOrigin(cruxId, files);
  }
  return cachePreviewFilesSameOrigin(cruxId, files);
}

/**
 * Update (or add) a single file in the cache without clearing other entries.
 */
export async function updatePreviewFile(cruxId: string, file: PreviewFile): Promise<void> {
  if (PREVIEW_ORIGIN) {
    return updatePreviewFileCrossOrigin(cruxId, file);
  }
  return updatePreviewFileSameOrigin(cruxId, file);
}

/**
 * Delete the preview cache for a crux.
 */
export async function clearPreviewCache(cruxId: string): Promise<void> {
  if (PREVIEW_ORIGIN) {
    return clearPreviewCacheCrossOrigin(cruxId);
  }
  await caches.delete(`crux-preview-${cruxId}`);
}

/**
 * Get the preview URL for a file. Returns a cross-origin URL when
 * VITE_PREVIEW_ORIGIN is set, otherwise a same-origin path.
 */
export function getPreviewUrl(cruxId: string, filePath: string, version?: number): string {
  const norm = normalizePath(filePath);
  const path = `${PREVIEW_PREFIX}${cruxId}/${norm}`;
  const url = PREVIEW_ORIGIN ? `${PREVIEW_ORIGIN}${path}` : path;
  return version != null ? `${url}?v=${version}` : url;
}

/**
 * Wait for the preview system to be ready.
 * Cross-origin: waits for the receiver iframe.
 * Same-origin: waits for the service worker.
 */
export async function waitForServiceWorker(): Promise<boolean> {
  if (PREVIEW_ORIGIN) {
    return waitForReceiver();
  }
  return waitForServiceWorkerSameOrigin();
}

// ── Same-origin implementation (fallback) ───────────────

async function cachePreviewFilesSameOrigin(cruxId: string, files: PreviewFile[]): Promise<void> {
  const cacheName = `crux-preview-${cruxId}`;
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

async function updatePreviewFileSameOrigin(cruxId: string, file: PreviewFile): Promise<void> {
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

async function waitForServiceWorkerSameOrigin(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const reg = await navigator.serviceWorker.ready;

    if (navigator.serviceWorker.controller) return true;

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

      if (navigator.serviceWorker.controller) {
        clearTimeout(timeout);
        resolve(true);
      }

      void reg;
    });
  } catch {
    return false;
  }
}

// ── Cross-origin implementation ─────────────────────────

async function cachePreviewFilesCrossOrigin(cruxId: string, files: PreviewFile[]): Promise<void> {
  const ready = await waitForReceiver();
  if (!ready) throw new Error('Preview receiver not ready');

  const transferFiles = await Promise.all(
    files.map(async (file) => {
      const norm = normalizePath(file.path);
      const buffer = await file.blob.arrayBuffer();
      return {
        path: norm,
        buffer,
        mimeType: file.mimeType || guessMime(norm),
      };
    }),
  );

  const transferables = transferFiles.map((f) => f.buffer);

  await postToReceiver(
    { type: 'crux:cache-files', cacheKey: cruxId, files: transferFiles },
    transferables,
    'crux:cache-complete',
    { key: 'cacheKey', value: cruxId },
  );
}

async function updatePreviewFileCrossOrigin(cruxId: string, file: PreviewFile): Promise<void> {
  const ready = await waitForReceiver();
  if (!ready) throw new Error('Preview receiver not ready');

  const norm = normalizePath(file.path);
  const buffer = await file.blob.arrayBuffer();
  const mimeType = file.mimeType || guessMime(norm);

  await postToReceiver(
    { type: 'crux:cache-file', cacheKey: cruxId, path: norm, buffer, mimeType },
    [buffer],
    'crux:cache-file-complete',
    { key: 'cacheKey', value: cruxId },
  );
}

async function clearPreviewCacheCrossOrigin(cruxId: string): Promise<void> {
  const ready = await waitForReceiver();
  if (!ready) return;

  await postToReceiver(
    { type: 'crux:cache-clear', cacheKey: cruxId },
    [],
    'crux:cache-clear-complete',
    { key: 'cacheKey', value: cruxId },
  ).catch(() => {});
}
