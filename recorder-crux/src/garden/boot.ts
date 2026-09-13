// Runs before Record's main.tsx (see index.html). Inside a Crux the app runs
// in an iframe, where the browser refuses Document Picture-in-Picture ("only
// allowed from a top-level browsing context"); Record needs that window for
// its camera bubble and its recording controls. The Garden stands in for it:
// a floating panel inside the app's own page with a real document of its own
// (a same-origin frame), shaped like the window Record expects — a document,
// a close() that fires pagehide, and a position a person can drag.
import { attach, embedded } from './bridge';

if (embedded) {
  const pip = {
    async requestWindow(options?: { width?: number; height?: number }): Promise<Window> {
      const width = Math.max(200, Math.min(options?.width ?? 300, 800));
      const height = Math.max(200, Math.min(options?.height ?? 300, 800));
      const panel = document.createElement('div');
      panel.id = 'garden-pip';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Recording controls');
      panel.style.cssText = `position:fixed;right:16px;bottom:50px;width:${width}px;height:${height + 22}px;z-index:100001;border:1px solid #3a403c;border-radius:8px;overflow:hidden;background:#111;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;flex-direction:column`;
      const handle = document.createElement('div');
      handle.textContent = 'Recording · drag to move';
      handle.style.cssText = 'height:22px;line-height:22px;padding:0 8px;background:#1f2a24;color:#e6e4dc;font:11px system-ui;cursor:move;user-select:none';
      const frame = document.createElement('iframe');
      frame.title = 'Recording controls';
      frame.setAttribute('aria-label', 'Recording controls');
      frame.style.cssText = 'flex:1;border:0;width:100%;background:#000';
      panel.append(handle, frame);
      document.body.append(panel);
      // A same-origin blank frame: its document is Record's to render into.
      const win = frame.contentWindow!;
      win.document.open();
      win.document.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000;color:#fff"></body></html>');
      win.document.close();
      let drag: { x: number; y: number; right: number; bottom: number } | null = null;
      handle.onpointerdown = (e) => {
        const rect = panel.getBoundingClientRect();
        drag = { x: e.clientX, y: e.clientY, right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom };
        handle.setPointerCapture(e.pointerId);
      };
      handle.onpointermove = (e) => {
        if (!drag) return;
        panel.style.right = `${Math.max(0, drag.right - (e.clientX - drag.x))}px`;
        panel.style.bottom = `${Math.max(0, drag.bottom - (e.clientY - drag.y))}px`;
      };
      handle.onpointerup = () => (drag = null);
      const close = () => {
        if (!panel.isConnected) return;
        const handler = (win as Window & { onpagehide: ((e: Event) => void) | null }).onpagehide;
        try {
          handler?.call(win, new Event('pagehide'));
        } finally {
          panel.remove();
        }
      };
      Object.defineProperty(win, 'close', { value: close, configurable: true });
      return win;
    },
    get window() {
      return null;
    },
  };
  Object.defineProperty(window, 'documentPictureInPicture', { value: pip, configurable: true });
  // Record asks for camera and microphone together. A microphone request the OS has not
  // answered holds every later media request of the same document, camera included, so
  // microphone requests run in a small hidden frame of their own with a bounded wait: a
  // microphone that does not answer is left out (Record asks again when one is chosen) and
  // the camera is never blocked by it.
  const original = MediaDevices.prototype.getUserMedia;
  const microphone = (constraints: MediaStreamConstraints, waitMs: number): Promise<MediaStream | null> => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    document.body.append(frame);
    const media = frame.contentWindow!.navigator.mediaDevices;
    return Promise.race<MediaStream | null>([
      media.getUserMedia(constraints).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs)),
    ]).then((stream) => {
      if (!stream) {
        frame.remove(); // abandons the unanswered request with the frame
        console.warn('[garden] The microphone did not answer; going on without it for now.');
      }
      return stream;
    });
  };
  MediaDevices.prototype.getUserMedia = async function (this: MediaDevices, constraints?: MediaStreamConstraints) {
    if (!constraints?.audio) return original.call(this, constraints);
    if (!constraints.video) {
      const stream = await microphone({ audio: constraints.audio }, 30000);
      if (!stream) throw new DOMException('The microphone did not answer.', 'NotReadableError');
      return stream;
    }
    const video = await original.call(this, { video: constraints.video });
    const audio = await microphone({ audio: constraints.audio }, 8000);
    return new MediaStream([...video.getTracks(), ...(audio ? audio.getTracks() : [])]);
  };
  attach();
}
