/**
 * Desktop preview screenshots (the "snapshot with screenshot" path).
 *
 * Web preview captures via the injected postMessage script; desktop preview
 * serves files verbatim (ADR 0003), so the shot is taken by the main process
 * instead: a hidden window loads the local preview URL and returns JPEG
 * bytes. Saved as the workspace's `preview.jpg` artifact — the same file the
 * web capture path writes, which snapshot cloning picks up as the thumbnail.
 */

import { Capability, can } from '@/lib/platform';
import { activePreviewUrl } from '@/lib/preview-registry';
import { getServices } from '@/services';
import { WORKSPACE_THUMBNAIL_PATH } from '@/lib/artifact-path';
import type { Artifact } from '@/services/types';

/** Screenshot a local preview URL via the main process. Desktop only. */
export async function captureLocalPreview(url: string): Promise<Blob> {
  const bridge = window.electronAPI?.preview;
  if (!can(Capability.PreviewServer) || !bridge?.capture) {
    throw new Error('Local preview capture requires the desktop app');
  }
  const bytes = await bridge.capture(url);
  return new Blob([bytes as BlobPart], { type: 'image/jpeg' });
}

/** Save a JPEG as the workspace's preview.jpg (create or replace). */
export async function saveWorkspacePreviewJpeg(cruxId: string, blob: Blob): Promise<Artifact> {
  const { artifact } = getServices();
  return artifact.upload({
    resourceId: cruxId,
    resourceType: 'crux',
    blob,
    mimeType: 'image/jpeg',
    meta: { path: WORKSPACE_THUMBNAIL_PATH },
    // The thumbnail is app state, not one of the user's files — writing it
    // through would drop a stray JPEG into their project folder on every
    // snapshot (and into `git status`, for a folder under version control).
    writeThrough: false,
  });
}

/**
 * Best-effort front-page screenshot of the crux's running preview, saved as
 * preview.jpg. Returns the saved artifact, or null when there's no running
 * preview / no desktop capture / the shot failed — snapshot creation
 * proceeds either way.
 */
export async function captureWorkspacePreview(cruxId: string): Promise<Artifact | null> {
  const url = activePreviewUrl(cruxId);
  if (!url) return null;
  try {
    const blob = await captureLocalPreview(url);
    return await saveWorkspacePreviewJpeg(cruxId, blob);
  } catch (err) {
    console.warn('[capture] preview screenshot failed:', err);
    return null;
  }
}
