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

export function onNativeProgress(
  cb: (event: { cruxId: string; tool: string; progress: number }) => void,
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
