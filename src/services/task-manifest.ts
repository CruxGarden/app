import { diff3Merge } from 'node-diff3';
import { hashContent } from './sqlite/helpers';

export interface TaskFile {
  fingerprint: string;
  mimeType: string;
  encoding: string;
  mode: number;
}
export type TaskManifest = Record<string, TaskFile>;
export interface TaskConflict {
  path: string;
  base?: TaskFile;
  main?: TaskFile;
  task?: TaskFile;
}
export type TaskResolution = 'main' | 'task';
export function isTaskArtifact(path: string): boolean {
  return (
    !/(^|\/)(\.env(?:\.[^/]*)?|\.crux|\.git|\.claude|\.codex|\.cursor|node_modules|dist|\.astro)(\/|$)/i.test(
      path,
    ) &&
    !/\.(pem|key)$/i.test(path) &&
    !['AGENTS.md', 'CLAUDE.md', 'preview.jpg'].includes(path) &&
    !path.includes('.crux-write-')
  );
}
export function validateTaskPaths(manifest: TaskManifest): void {
  const paths = Object.keys(manifest).sort();
  const folded = new Set<string>();
  for (const p of paths) {
    if (
      !p ||
      p.startsWith('/') ||
      p.includes('\\') ||
      p.includes(':') ||
      p.includes('\0') ||
      p.split('/').some((x) => !x || x === '.' || x === '..')
    )
      throw new Error(`Invalid Artifact path: ${p}`);
    if (!isTaskArtifact(p)) throw new Error(`This path cannot be included in a task: ${p}`);
    const key = p.normalize('NFC').toLowerCase();
    if (folded.has(key)) throw new Error(`Case-insensitive path collision: ${p}`);
    folded.add(key);
  }
  for (const p of folded) {
    const pieces = p.split('/');
    pieces.pop();
    while (pieces.length) {
      if (folded.has(pieces.join('/'))) throw new Error(`File/directory conflict: ${p}`);
      pieces.pop();
    }
  }
}
export function sameTaskFile(a?: TaskFile, b?: TaskFile): boolean {
  return a?.fingerprint === b?.fingerprint && (a?.mode ?? 0o644) === (b?.mode ?? 0o644);
}
export function taskManifestKey(manifest: TaskManifest): string {
  return JSON.stringify(
    Object.keys(manifest)
      .sort()
      .map((path) => [path, manifest[path]!.fingerprint, manifest[path]!.mode]),
  );
}
export async function mergeTaskManifests(
  base: TaskManifest,
  main: TaskManifest,
  task: TaskManifest,
  read: (fp: string) => Promise<Uint8Array>,
  write: (fp: string, data: Uint8Array) => Promise<void>,
  resolutions: Record<string, TaskResolution> = {},
): Promise<{ manifest: TaskManifest; conflicts: TaskConflict[] }> {
  const manifest: TaskManifest = {};
  const conflicts: TaskConflict[] = [];
  for (const path of [
    ...new Set([...Object.keys(base), ...Object.keys(main), ...Object.keys(task)]),
  ].sort()) {
    const b = base[path],
      m = main[path],
      t = task[path];
    let chosen: TaskFile | undefined;
    if (sameTaskFile(m, t)) chosen = m;
    else if (sameTaskFile(b, m)) chosen = t;
    else if (sameTaskFile(b, t)) chosen = m;
    else {
      const resolution = resolutions[path];
      if (resolution) chosen = resolution === 'main' ? m : t;
      else if (b && m && t && [b, m, t].every((f) => f.encoding === 'utf-8') && m.mode === t.mode) {
        const bytes = await Promise.all([
          read(m.fingerprint),
          read(b.fingerprint),
          read(t.fingerprint),
        ]);
        if (bytes.every((v) => v.byteLength <= 1024 * 1024 && !v.includes(0))) {
          const [mt, bt, tt] = bytes.map((v) =>
            new TextDecoder('utf-8', { fatal: true }).decode(v).split('\n'),
          );
          const blocks = diff3Merge(mt!, bt!, tt!);
          if (blocks.every((block) => 'ok' in block)) {
            const data = new TextEncoder().encode(
              blocks.flatMap((block) => ('ok' in block ? block.ok : [])).join('\n'),
            );
            const fingerprint = await hashContent(data);
            await write(fingerprint, data);
            chosen = { ...m, fingerprint };
          } else conflicts.push({ path, base: b, main: m, task: t });
        } else conflicts.push({ path, base: b, main: m, task: t });
      } else conflicts.push({ path, base: b, main: m, task: t });
    }
    if (chosen) manifest[path] = chosen;
  }
  if (!conflicts.length) validateTaskPaths(manifest);
  return { manifest, conflicts };
}
