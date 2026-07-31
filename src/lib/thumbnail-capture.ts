/**
 * Thumbnail capture strategies for crux previews (saved as preview.jpg).
 *
 * Three sources, one output size:
 * - HTML  — postMessage handshake with the preview iframe (the injected
 *           preview script renders the page to JPEG and posts it back)
 * - Image — draw the (loaded) image element to a canvas, scaled to fit
 * - Video — seek to 1s, grab the frame, scaled to fit
 *
 * DOM-dependent by nature; the pure geometry lives in `scaleToFit` so it can
 * be unit-tested. `onCaptureSettled` is the single listener implementation
 * for "a capture finished" — UI spinners subscribe through it instead of
 * duplicating the message protocol.
 */

/** Capture canvas bounds — also the off-screen preview iframe's size. */
export const CAPTURE_SIZE = { width: 1280, height: 900 } as const;

const CAPTURE_TIMEOUT_MS = 10000;

/** Origin the preview iframe posts capture messages from. */
export function previewOrigin(): string {
  return import.meta.env.VITE_PREVIEW_ORIGIN || window.location.origin;
}

/**
 * Scale (width, height) down to fit within max bounds, preserving aspect
 * ratio. Dimensions already within bounds pass through unchanged.
 */
export function scaleToFit(
  width: number,
  height: number,
  maxWidth: number = CAPTURE_SIZE.width,
  maxHeight: number = CAPTURE_SIZE.height,
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) return { width, height };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Draw a source onto a canvas at the given size and export as JPEG. */
function drawToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas JPEG export failed'))),
      'image/jpeg',
      1,
    );
  });
}

/**
 * Capture the preview iframe via the crux:capture postMessage protocol.
 * Sends `crux:capture`; resolves on `crux:capture-result` (JPEG bytes),
 * rejects on `crux:capture-error` or after the timeout.
 */
export function captureHtml(
  iframe: HTMLIFrameElement,
  targetOrigin: string,
  timeoutMs: number = CAPTURE_TIMEOUT_MS,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const win = iframe.contentWindow;
    if (!win) {
      reject(new Error('Preview iframe has no content window'));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Capture timed out'));
    }, timeoutMs);

    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== targetOrigin) return;
      if (!e.data) return;
      if (e.data.type === 'crux:capture-result') {
        cleanup();
        resolve(new Blob([e.data.buffer], { type: 'image/jpeg' }));
      }
      if (e.data.type === 'crux:capture-error') {
        cleanup();
        reject(new Error(String(e.data.error)));
      }
    }

    window.addEventListener('message', onMessage);
    win.postMessage({ type: 'crux:capture' }, targetOrigin);
  });
}

/** Capture an image element (waits for load if needed), scaled to fit. */
export async function captureImage(imgEl: HTMLImageElement): Promise<Blob> {
  if (!imgEl.complete) {
    await new Promise<void>((resolve, reject) => {
      imgEl.onload = () => resolve();
      imgEl.onerror = () => reject(new Error('Image failed to load'));
    });
  }
  const { width, height } = scaleToFit(imgEl.naturalWidth, imgEl.naturalHeight);
  return drawToJpeg(imgEl, width, height);
}

/**
 * Capture a frame from a video element, scaled to fit. Call before (or in the
 * same task as) assigning `videoEl.src`; once data loads it seeks to 1s (or
 * the start for shorter clips) and grabs that frame.
 */
export function captureVideo(videoEl: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    videoEl.onloadeddata = () => {
      // Seek to 1s or 0 if shorter
      videoEl.currentTime = Math.min(1, videoEl.duration || 0);
    };
    videoEl.onseeked = () => {
      const { width, height } = scaleToFit(videoEl.videoWidth, videoEl.videoHeight);
      drawToJpeg(videoEl, width, height).then(resolve, reject);
    };
    videoEl.onerror = () => reject(new Error('Video failed to load'));
  });
}

/**
 * Subscribe to capture completion (result or error) from the preview iframe.
 * The one listener implementation for UI state like the toolbar's capturing
 * spinner. Returns an unsubscribe function.
 */
export function onCaptureSettled(cb: (outcome: 'result' | 'error') => void): () => void {
  const origin = previewOrigin();
  function onMessage(e: MessageEvent) {
    if (e.origin !== origin) return;
    if (e.data?.type === 'crux:capture-result') cb('result');
    else if (e.data?.type === 'crux:capture-error') cb('error');
  }
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
