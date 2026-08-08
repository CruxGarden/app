/**
 * The static preview server per crux (ADR 0003) — renderer side.
 *
 * Like the Site Crux dev server, this server belongs to the crux but is
 * started from per-tab editor effects, so access is leased: the last tab to
 * leave shuts it down, and only after a grace period (see lib/lease.ts), which
 * makes a tab switch a no-op instead of a stop/start cycle.
 */

import { Capability, can, type PreviewBridge } from '@/lib/platform';
import { folderForCrux } from './project-folder';
import { createLeasePool } from '@/lib/lease';

function previewBridge(): PreviewBridge | null {
  if (!can(Capability.PreviewServer)) return null;
  return window.electronAPI?.preview ?? null;
}

export const previewServerLeases = createLeasePool({
  graceMs: 3000,
  stop: async (cruxId) => {
    const bridge = previewBridge();
    if (!bridge) return;
    const folder = await folderForCrux(cruxId);
    if (folder) await bridge.stop(folder);
  },
  onStopError: (cruxId, err) => console.error(`[preview] server stop failed (${cruxId}):`, err),
});

/**
 * Start (or reuse) the crux's static preview server and take a lease.
 * Returns its base URL, or null when unavailable (web, or no Project Folder).
 */
export async function startPreviewServer(cruxId: string): Promise<string | null> {
  const bridge = previewBridge();
  if (!bridge) return null;
  const folder = await folderForCrux(cruxId);
  if (!folder) return null;

  previewServerLeases.acquire(cruxId);
  try {
    return await bridge.start(folder);
  } catch (err) {
    previewServerLeases.release(cruxId);
    throw err;
  }
}

/** Release a lease. The server stops once no leases remain. */
export async function stopPreviewServer(cruxId: string): Promise<void> {
  previewServerLeases.release(cruxId);
}
