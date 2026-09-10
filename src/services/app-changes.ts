import type { Artifact, Crux } from '@/api/types';
import { pathOf, isWorkspaceThumbnail } from '@/lib/artifact-path';
import { isGeneratedGuidePath } from './agents-md';
import { isEmbeddedApp, embeddedContentRoot } from './embedded-app';

export interface AppChanges {
  app: number;
  content: number;
}
/** App data and generated history/agent metadata must not restart a running editor. */
export function appPreviewKey(crux: Crux | null, artifacts: Artifact[]): string {
  const root = isEmbeddedApp(crux) ? embeddedContentRoot(crux) : null;
  return artifacts
    .filter((a) => {
      const path = pathOf(a);
      return (
        !root ||
        (!path.startsWith(root) && !isWorkspaceThumbnail(path) && !isGeneratedGuidePath(path))
      );
    })
    .map((a) => `${a.id}:${a.fingerprint || a.updated}`)
    .sort()
    .join(',');
}
/** Persist two counts, derived from metadata only; content blobs are never loaded. */
export function appChanges(crux: Crux, before: Artifact[], after: Artifact[]): AppChanges | null {
  if (!isEmbeddedApp(crux)) return null;
  const manifest = (files: Artifact[]) => new Map(files.map((a) => [pathOf(a), a.fingerprint]));
  const old = manifest(before),
    current = manifest(after);
  const result: AppChanges = { app: 0, content: 0 };
  const contentRoot = embeddedContentRoot(crux);
  for (const path of new Set([...old.keys(), ...current.keys()])) {
    if (isWorkspaceThumbnail(path) || isGeneratedGuidePath(path) || path.endsWith('.keep'))
      continue;
    if (old.has(path) !== current.has(path) || old.get(path) !== current.get(path)) {
      result[path.startsWith(contentRoot) ? 'content' : 'app']++;
    }
  }
  return result;
}
export function appChangesLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const { app, content } = value as AppChanges;
  if (!Number.isSafeInteger(app) || app < 0 || !Number.isSafeInteger(content) || content < 0)
    return null;
  return app && content
    ? 'App and content changed'
    : app
      ? 'App changed'
      : content
        ? 'Content changed'
        : 'No file changes';
}
