import {
  exportPrivateCrux,
  importPrivateCrux,
  privateArchiveBytes,
  privateArchiveService,
} from './private-crux-archive';
import { generateZip } from '@/lib/zip-off-thread';
import type { RuntimeMode } from './archive-runtimes';
import { assertMainWorkspace, listWorkingCopies } from './working-copies';
import JSZip from 'jszip';
import { getServices } from './index';
import { NotFoundError } from './types';
import { getSqliteClient } from './sqlite/client';

export interface ExportOptions {
  runtime?: RuntimeMode;
  cruxId: string;
  /** Dialog hints; native export always captures authoritative saved Collaboration. */
  messages?: unknown[];
  summary?: unknown;
  author?: { username: string; displayName: string } | null;
  onProgress?: (status: string) => void;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  failed: string[];
}

export interface ArtifactsZipOptions {
  cruxSlug?: string;
  artifacts: {
    fingerprint?: string;
    filename: string;
    meta?: { path?: string; [key: string]: unknown };
  }[];
  onProgress?: (status: string) => void;
}

export interface ArtifactsZipResult {
  blob: Blob;
  filename: string;
  failed: string[];
}

export type ImportMode = 'restore' | 'replace' | 'clone';

export interface ImportConflictInfo {
  title: string;
  installedVersion: number;
  installedUpdated: string;
  incomingVersion: number;
  incomingUpdated: string;
}

export interface ImportOptions {
  gardenId?: string;
  /** Reuse for retries of the same import action. */
  requestId?: string;
  data: Blob | ArrayBuffer;
  mode?: ImportMode;
  onProgress?: (done: number, total: number) => void;
}

export interface ImportResult {
  cruxId: string;
  title: string;
  growthCount: number;
  failedArtifacts: string[];
  layout?: {
    paneOrder?: string[];
    paneVisibility?: Record<string, boolean>;
    editorTabs?: unknown;
    folderState?: unknown;
  };
  theme?: { mode?: string; tint?: string };
}

/** Validate through the native API before reporting conflict metadata. */
export async function peekImport(data: Blob | ArrayBuffer): Promise<{
  cruxData: Record<string, unknown>;
  conflict: ImportConflictInfo | null;
}> {
  const info = await privateArchiveService().inspect(await privateArchiveBytes(data));
  if (info.roots.length !== 1) throw new Error('Choose an archive with one selected root Crux.');
  const cruxData = info.root;
  let conflict: ImportConflictInfo | null = null;
  try {
    const existing = await getServices().crux.findById(info.roots[0]!);
    conflict = {
      title: String(cruxData.title || 'Imported Crux'),
      installedVersion: existing.meta?.growthCount || 0,
      installedUpdated: existing.updated,
      incomingVersion: info.growthCount,
      incomingUpdated: String(cruxData.updated || ''),
    };
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  return { cruxData, conflict };
}

/** Settle the captured source, then export its complete API-owned private graph. */
export async function exportCrux(options: ExportOptions): Promise<ExportResult> {
  const captured = { cruxId: options.cruxId, onProgress: options.onProgress };
  privateArchiveService();
  await assertMainWorkspace(captured.cruxId);
  const copies = await listWorkingCopies(captured.cruxId);
  await (
    await import('./file-content')
  ).finishPendingContentProjections([captured.cruxId, ...copies.map((copy) => copy.id)]);
  return exportPrivateCrux(captured);
}

export function importCrux(options: ImportOptions): Promise<ImportResult> {
  return importPrivateCrux(options);
}

/** A plain file ZIP remains separate from a private graph archive. */
export async function exportArtifactsZip(
  options: ArtifactsZipOptions,
): Promise<ArtifactsZipResult> {
  const { cruxSlug, artifacts, onProgress } = options;
  const db = getSqliteClient();
  const zip = new JSZip();
  const failed: string[] = [];

  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i]!;
    const fp = a.fingerprint;
    if (!fp) continue;

    const path = (a.meta?.path as string) || a.filename || `file-${i + 1}`;
    onProgress?.(`${i + 1}/${artifacts.length} files`);

    try {
      const bytes = await db.blobRead(fp);
      zip.file(path, bytes, { binary: true });
    } catch (err) {
      console.warn(`Failed to read blob: ${fp}`, err);
      failed.push(path);
    }
  }

  onProgress?.('Compressing...');
  const blob = await generateZip(zip, { onProgress: (p) => onProgress?.(`Packing ${p}%`) });

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `${cruxSlug || 'crux'}-${ts}.zip`;

  return { blob, filename, failed };
}
