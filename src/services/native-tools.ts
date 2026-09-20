import { Capability, can } from '@/lib/platform';

/**
 * Native tools (MAKING-THE-AD-PARITY gap 13, step 1): a binary the shell
 * bundles, run inside a crux's Project Folder through one audited seam —
 * working directory pinned to the folder, path arguments confined to it, no
 * protocols, no shell. Only ffmpeg for now. The same call serves the person
 * (Artifacts → Convert) and the collaborator (`run_ffmpeg`).
 */
export interface NativeRunResult {
  code: number;
  ms: number;
  stderrTail: string;
}

export function nativeToolsAvailable(): boolean {
  return can(Capability.NativeTools);
}

export async function runFfmpeg(
  cruxId: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<NativeRunResult> {
  const api = typeof window !== 'undefined' ? window.electronAPI?.native : undefined;
  if (!api) throw new Error('Native tools are not available here (desktop only).');
  return api.run({ cruxId, tool: 'ffmpeg', args, ...opts });
}

/** Frames from the crux's running preview into `<subdir>/fNNNN.png` (step 5). */
export async function recordPreview(
  cruxId: string,
  url: string,
  opts: {
    subdir?: string;
    fps?: number;
    maxSeconds?: number;
    width?: number;
    height?: number;
  } = {},
): Promise<{ frames: number; seconds: number; lastPoll?: string }> {
  const api = typeof window !== 'undefined' ? window.electronAPI?.native : undefined;
  if (!api) throw new Error('Native tools are not available here (desktop only).');
  return api.record({ cruxId, url, ...opts });
}

/** Record the preview, then encode the frames with the bundled ffmpeg: `exports/<name>.mp4`. */
export async function renderVideo(
  cruxId: string,
  url: string,
  opts: { name?: string; fps?: number; maxSeconds?: number; width?: number; height?: number } = {},
): Promise<{ path: string; frames: number; seconds: number; encode: NativeRunResult }> {
  const fps = opts.fps ?? 30;
  const name = (opts.name ?? 'render').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.mp4$/i, '');
  const subdir = `exports/${name}-frames`;
  const rec = await recordPreview(cruxId, url, { subdir, fps, ...opts });
  if (rec.frames === 0) throw new Error('No frames were captured.');
  console.info('[render] frames', rec.frames, 'last poll of done:', rec.lastPoll);
  const path = `exports/${name}.mp4`;
  const encode = await runFfmpeg(cruxId, [
    '-y',
    '-framerate',
    String(fps),
    '-i',
    `${subdir}/f%04d.png`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    path,
  ]);
  if (encode.code !== 0) throw new Error(describeRun(['…'], encode));
  return { path, frames: rec.frames, seconds: rec.seconds, encode };
}

export function onNativeProgress(
  cb: (event: { cruxId: string; tool: string; progress: number; frames?: number }) => void,
): () => void {
  const api = typeof window !== 'undefined' ? window.electronAPI?.native : undefined;
  return api ? api.onProgress(cb) : () => {};
}

/** A readable one-line account of a run, for the collaborator and the pane. */
export function describeRun(args: string[], r: NativeRunResult): string {
  const secs = (r.ms / 1000).toFixed(1);
  if (r.code === 0) return `ffmpeg ${args.join(' ')} — done in ${secs}s.`;
  return `ffmpeg exited ${r.code} after ${secs}s.\n${r.stderrTail.trim()}`;
}
