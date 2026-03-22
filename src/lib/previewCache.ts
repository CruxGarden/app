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
  // Always inject the capture listener (for thumbnail screenshots)
  // and the store client (for local crux store testing)
  let result = injectCaptureScript(html);
  result = injectStoreClient(result);

  if (!isWebApp) return result;

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

  if (result.includes('</head>')) {
    return result.replace('</head>', `${script}\n</head>`);
  }
  if (result.includes('</body>')) {
    return result.replace('</body>', `${script}\n</body>`);
  }
  return result + `\n${script}`;
}

/**
 * Inject a self-contained capture script into HTML.
 * Listens for `crux:capture` postMessage, screenshots the page via
 * SVG foreignObject → canvas → PNG, and sends the blob back.
 */
function injectCaptureScript(html: string): string {
  const script = `<script data-crux-capture>
(function(){
  if(window.__cruxCaptureReady)return;
  window.__cruxCaptureReady=true;
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='crux:capture')setTimeout(doCapture,0);
  });
  async function doCapture(){
    try{
      var doc=document.documentElement;
      var w=Math.min(doc.scrollWidth||800,1280);
      var h=Math.min(doc.scrollHeight||600,900);
      var clone=doc.cloneNode(true);
      // Collect all CSS rules into a single style block
      var css='';
      for(var i=0;i<document.styleSheets.length;i++){
        try{var rules=document.styleSheets[i].cssRules;
          for(var j=0;j<rules.length;j++)css+=rules[j].cssText+'\\n';
        }catch(e){}
      }
      // Remove external stylesheets and scripts from clone
      clone.querySelectorAll('link[rel="stylesheet"],script').forEach(function(el){el.remove();});
      var styleEl=document.createElement('style');
      styleEl.textContent=css;
      var head=clone.querySelector('head');
      if(head)head.appendChild(styleEl);
      else clone.insertBefore(styleEl,clone.firstChild);
      // Convert same-origin images to data URIs
      var origImgs=document.querySelectorAll('img');
      var cloneImgs=clone.querySelectorAll('img');
      for(var i=0;i<origImgs.length;i++){
        if(origImgs[i].complete&&origImgs[i].naturalWidth>0){
          try{var c=document.createElement('canvas');
            c.width=origImgs[i].naturalWidth;c.height=origImgs[i].naturalHeight;
            c.getContext('2d').drawImage(origImgs[i],0,0);
            cloneImgs[i].setAttribute('src',c.toDataURL());
          }catch(e){}
        }
      }
      // Convert canvas elements to images
      var origCanvas=document.querySelectorAll('canvas');
      var cloneCanvas=clone.querySelectorAll('canvas');
      for(var i=origCanvas.length-1;i>=0;i--){
        try{var img=document.createElement('img');
          img.setAttribute('src',origCanvas[i].toDataURL());
          img.setAttribute('width',origCanvas[i].width);
          img.setAttribute('height',origCanvas[i].height);
          cloneCanvas[i].replaceWith(img);
        }catch(e){}
      }
      clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
      var serialized=new XMLSerializer().serializeToString(clone);
      var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">'
        +'<foreignObject width="100%" height="100%">'+serialized+'</foreignObject></svg>';
      var canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      var ctx=canvas.getContext('2d');
      var img=new Image();
      img.onload=function(){
        ctx.drawImage(img,0,0);
        canvas.toBlob(function(blob){
          if(blob){
            blob.arrayBuffer().then(function(buf){
              window.parent.postMessage({type:'crux:capture-result',buffer:buf},'*',[buf]);
            });
          }else{
            window.parent.postMessage({type:'crux:capture-error',error:'toBlob failed'},'*');
          }
        },'image/jpeg',1);
      };
      img.onerror=function(){
        window.parent.postMessage({type:'crux:capture-error',error:'SVG render failed'},'*');
      };
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    }catch(e){
      window.parent.postMessage({type:'crux:capture-error',error:e.message||'capture failed'},'*');
    }
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

/**
 * Inject the crux.store client for local preview mode.
 * All calls route back to the parent workspace via postMessage.
 */
function injectStoreClient(html: string): string {
  const script = `<script data-crux-store>
(function(){
  if(window.crux&&window.crux.store)return;
  window.crux=window.crux||{};
  function localCall(type,payload){
    return new Promise(function(res){
      var id=Math.random().toString(36).slice(2);
      var timeout=setTimeout(function(){window.removeEventListener('message',h);res(null);},5000);
      function h(e){
        if(e.data&&e.data.id===id&&e.data.type===type+':res'){
          clearTimeout(timeout);
          window.removeEventListener('message',h);
          res(e.data.value!==undefined?e.data.value:e.data.keys||null);
        }
      }
      window.addEventListener('message',h);
      window.parent.postMessage(Object.assign({type:type,id:id},payload),'*');
    });
  }
  window.crux.store={
    get:function(key){return localCall('crux:store:get',{key:key});},
    set:function(key,value,opts){var m=(opts&&opts.mode)||'protected';window.parent.postMessage({type:'crux:store:set',key:key,value:value,mode:m},'*');return Promise.resolve();},
    increment:function(key,by){return localCall('crux:store:inc',{key:key,by:by||1});},
    delete:function(key){window.parent.postMessage({type:'crux:store:del',key:key},'*');return Promise.resolve();},
    list:function(){return localCall('crux:store:list',{});}
  };
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
