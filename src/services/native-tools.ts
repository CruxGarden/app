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
  /** What the tool wrote to stdout — ffprobe's JSON, ImageMagick's `identify`. */
  stdout?: string;
}

/** The media binaries, as this machine has them (platform-aware, electron/src/media-binaries.ts). */
/** The programs the shell will run. One list, so nothing drifts out of it. */
export const MEDIA_TOOL_NAMES = ['ffmpeg', 'ffprobe', 'magick', 'pandoc'] as const;
export type MediaToolName = (typeof MEDIA_TOOL_NAMES)[number];
export interface MediaToolInfo {
  tool: MediaToolName;
  path: string | null;
  source: 'bundled' | 'resources' | 'system' | 'missing';
  version: string | null;
}

export function nativeToolsAvailable(): boolean {
  return can(Capability.NativeTools);
}

function nativeApi() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.native : undefined;
  if (!api) throw new Error('Native tools are not available here (desktop only).');
  return api;
}

/** Which binaries this machine has; `refresh` looks again after an install. */
export async function mediaTools(refresh = false): Promise<MediaToolInfo[]> {
  const api = typeof window !== 'undefined' ? window.electronAPI?.native : undefined;
  if (!api?.tools) return [];
  return api.tools({ refresh });
}

/** Run one media binary inside the crux's folder. */
export async function runMediaTool(
  cruxId: string,
  tool: MediaToolName,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<NativeRunResult> {
  return nativeApi().run({ cruxId, tool, args, ...opts });
}

export async function runFfmpeg(
  cruxId: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<NativeRunResult> {
  return runMediaTool(cruxId, 'ffmpeg', args, opts);
}

/** Pandoc: documents between formats — Markdown, DOCX, HTML, EPUB, PDF. */
export async function runPandoc(
  cruxId: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<NativeRunResult> {
  return runMediaTool(cruxId, 'pandoc', args, opts);
}

/** ImageMagick: `magick <args>` (ImageMagick 7) or `convert <args>` (6) — the shell picks. */
export async function runMagick(
  cruxId: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<NativeRunResult> {
  return runMediaTool(cruxId, 'magick', args, opts);
}

/** What a media file is: ffprobe's JSON for audio and video, ImageMagick's for a picture. */
export async function probeMedia(
  cruxId: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  const picture = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|svg)$/i.test(path);
  if (picture) {
    const r = await runMagick(cruxId, [
      'identify',
      '-format',
      '{"format":"%m","width":%w,"height":%h,"depth":%z,"colorspace":"%[colorspace]","bytes":%B}',
      path,
    ]);
    if (r.code !== 0) return null;
    try {
      return JSON.parse((r.stdout ?? '').trim()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const r = await runMediaTool(cruxId, 'ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    path,
  ]);
  if (r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout ?? '') as Record<string, unknown>;
  } catch {
    return null;
  }
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
  // Frames are working state, not work: under `.crux/` the watcher never
  // ingests them, so they are neither Artifacts nor part of an export (a
  // thirty-second spot's frames made a 71 MiB .crux on 2026-09-20).
  const subdir = `.crux/render/${name}`;
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
