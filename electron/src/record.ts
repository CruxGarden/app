import * as fs from 'fs';
import * as path from 'path';
import { withCaptureWindow } from './capture';

/**
 * Frames from a local preview page (MAKING-IT-POSSIBLE-STEPS step 5): the
 * page is loaded in the contained capture window, and a PNG is taken every
 * 1000/fps ms — wall-clock paced, so a page that is a timeline of its own
 * plays at speed — until the page sets `document.body.dataset.done = "1"`
 * or the cap is reached. Real time first; deterministic virtual time is the
 * follow-up. The step-1 seam then encodes the frames.
 */
export interface RecordOptions {
  /** Where the frames go — must already be confined to the crux folder by the caller. */
  dir: string;
  fps: number;
  /** Stop after this many seconds if the page never says it is done. */
  maxSeconds: number;
  width: number;
  height: number;
}

export async function recordPreviewUrl(
  url: string,
  opts: RecordOptions,
  onProgress?: (frames: number, seconds: number) => void,
): Promise<{ frames: number; seconds: number; lastPoll: string }> {
  const fps = Math.min(60, Math.max(1, Math.round(opts.fps)));
  const maxFrames = Math.min(60 * 180, Math.round(opts.maxSeconds * fps));
  fs.mkdirSync(opts.dir, { recursive: true });
  for (const f of fs.readdirSync(opts.dir))
    if (/^f\d{4}\.png$/.test(f)) fs.unlinkSync(path.join(opts.dir, f));
  return withCaptureWindow(url, { width: opts.width, height: opts.height }, async (win) => {
    const start = Date.now();
    let frames = 0;
    let lastPoll: unknown = 'never';
    const done = async () => {
      try {
        lastPoll = await win.webContents.executeJavaScript(
          '(function(){ try { return JSON.stringify({ href: location.href, state: document.readyState, done: document.body && document.body.dataset.done, two: 1 + 1 }); } catch (e) { return "throw: " + e.message; } })()',
        );
      } catch (err) {
        lastPoll = `error: ${(err as Error).message}`;
      }
      return typeof lastPoll === 'string' && /"done":"1"/.test(lastPoll);
    };
    while (frames < maxFrames) {
      const due = start + (frames * 1000) / fps;
      const wait = due - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const image = await win.webContents.capturePage();
      const png = image.resize({ width: opts.width, height: opts.height }).toPNG();
      fs.writeFileSync(path.join(opts.dir, `f${String(frames).padStart(4, '0')}.png`), png);
      frames += 1;
      if (frames % fps === 0) {
        onProgress?.(frames, frames / fps);
        if (await done()) break;
      }
    }
    return { frames, seconds: frames / fps, lastPoll: String(lastPoll) };
  });
}
