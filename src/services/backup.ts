/**
 * Backups — a crux's archive (files, history, conversation) pushed to the
 * account's sync storage. A published site is not a backup (RESILIENCE-PLAN
 * §1): it holds served files and the public conversation, not sources or
 * history. This module is the one place a crux is backed up from — the Sync
 * pane's button, the share-time prompt, and (later) automatic backup all call
 * it — and it records when, so the Share pane can say "backup is 3 snapshots
 * behind" without asking the API.
 */
import { useCruxStore } from '@/stores/cruxStore';
import { useAppStore } from '@/stores/appStore';
import { exportCrux } from '@/services/crux-io';
import * as syncApi from '@/api/sync';
import type { Crux } from '@/api/types';

/** What the local crux remembers about its last backup (crux meta `backup`). */
export interface BackupRecord {
  at: string;
  /** growthCount when the backup was taken — the "behind" arithmetic */
  growthCount: number;
  size: number;
}

export function backupOf(crux: Crux | null | undefined): BackupRecord | null {
  const b = crux?.meta?.backup as Partial<BackupRecord> | undefined;
  return b && typeof b.at === 'string' ? (b as BackupRecord) : null;
}

/** Snapshots taken since the last backup; null when never backed up. */
export function snapshotsBehind(crux: Crux | null | undefined, growthCount: number): number | null {
  const b = backupOf(crux);
  if (!b) return null;
  return Math.max(0, growthCount - b.growthCount);
}

/**
 * Export the open crux and push it. Resolves with the record it saved. Throws
 * on failure (callers decide whether that blocks what they were doing).
 */
export async function backupCurrentCrux(onProgress?: (msg: string) => void): Promise<BackupRecord> {
  const s = useCruxStore.getState();
  const crux = s.crux;
  if (!crux) throw new Error('No crux is open');
  const author = useAppStore.getState().author;
  const messages = s.messages.slice(s.messageSegmentStart);
  onProgress?.('Exporting crux...');
  const result = await exportCrux({
    cruxId: crux.id,
    messages,
    summary: s.summary,
    author: author ? { username: author.username, displayName: author.displayName } : null,
    onProgress,
  });
  onProgress?.('Uploading to crux.garden...');
  const entry = await syncApi.pushCrux(crux.id, result.blob, {
    slug: crux.slug || crux.id,
    title: crux.title || 'Untitled',
  });
  const record: BackupRecord = {
    at: entry.updatedAt,
    growthCount: useCruxStore.getState().growthCount,
    size: entry.size,
  };
  await useCruxStore.getState().updateCrux({ meta: { backup: record } });
  onProgress?.('Backed up');
  return record;
}
