import {
  archiveRuntimeMode,
  referenceArchiveRuntimes,
  hydrateArchiveRuntimes,
  type RuntimeMode,
} from './archive-runtimes';
import JSZip from 'jszip';
import { getSqliteClient } from './sqlite/client';
import { hashContent } from './sqlite/helpers';
import { clearAllSettings } from './settings';

// ── Constants ────────────────────────────────────────────

const SUPPORTED_MANIFEST_MAJOR = '4';

// ── Types ───────────────────────────────────────────────

export interface GardenExportOptions {
  runtime?: RuntimeMode;
  author?: { username: string; displayName: string } | null;
  onProgress?: (status: string) => void;
}

export interface GardenExportResult {
  blob: Blob;
  filename: string;
}

export interface GardenImportOptions {
  data: Blob | ArrayBuffer;
  onProgress?: (status: string) => void;
}

export interface GardenImportResult {
  cruxCount: number;
  artifactCount: number;
}

// ── Helpers ─────────────────────────────────────────────

async function toArrayBuffer(data: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  return data instanceof Blob ? data.arrayBuffer() : data;
}

// ── Wipe ────────────────────────────────────────────────

const ALL_TABLES = [
  'task_merges',
  'working_copies',
  'store',
  'cruxes',
  'artifacts',
  'dimensions',
  'authors',
  'settings',
];

export async function wipeGarden(onProgress?: (status: string) => void): Promise<void> {
  await (await import('@/stores/workspaceRegistry')).prepareGardenReplacement();
  const db = getSqliteClient();

  onProgress?.('Deleting all data...');
  if (db.installation) {
    // Desktop: every record goes in one transaction, or none does.
    await db.installation.wipeGarden();
  } else {
    if (
      await db.get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'file_content_heads'",
      )
    )
      await db.run('DELETE FROM file_content_heads');
    for (const table of ALL_TABLES) await db.run(`DELETE FROM ${table}`);
  }

  onProgress?.('Removing all files...');
  await db.blobWipeAll();

  onProgress?.('Clearing settings...');
  clearAllSettings();

  // Clear cruxgarden:* keys from localStorage to prevent initSettings()
  // from migrating them back into the freshly wiped SQLite database.
  if (typeof localStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cruxgarden:')) keysToRemove.push(key);
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
  }

  onProgress?.('Wipe complete');
}

// ── Export ───────────────────────────────────────────────

export async function exportGarden(options: GardenExportOptions = {}): Promise<GardenExportResult> {
  const { author = null, onProgress } = options;
  const db = getSqliteClient();

  if (await db.get("SELECT id FROM task_merges WHERE phase = 'applying'"))
    throw new Error('Recover pending task merges before exporting the garden.');
  await (await import('./file-content')).finishPendingContentProjections();
  onProgress?.('Exporting database...');
  const sqliteData = await db.export();

  onProgress?.('Collecting artifacts...');

  // Get counts
  const cruxCountRow = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM cruxes WHERE type = 'workspace'",
  );
  const cruxCount = cruxCountRow?.count ?? 0;

  // Match the captured database, even if live references change afterward.
  const fingerprints = await db.inspectImport(sqliteData);

  const zip = new JSZip();

  // garden.sqlite — metadata only (no content column)
  zip.file('garden.sqlite', sqliteData);

  // Artifact blobs from OPFS, keyed by fingerprint
  let artifactCount = 0;
  for (let i = 0; i < fingerprints.length; i++) {
    const fingerprint = fingerprints[i]!;
    onProgress?.(`Extracting artifact ${i + 1}/${fingerprints.length}...`);

    try {
      const bytes = await db.blobRead(fingerprint);
      zip.file(`artifacts/${fingerprint}`, bytes);
      artifactCount++;
    } catch (err) {
      throw new Error(
        `Garden backup stopped because an Artifact could not be read: ${fingerprint}`,
        { cause: err },
      );
    }
  }

  // Compute fingerprint of the SQLite file
  onProgress?.('Computing integrity fingerprint...');
  const fingerprint = await hashContent(new Uint8Array(sqliteData));

  // manifest.json
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        version: '4.0',
        scope: 'installation',
        exportedAt: new Date().toISOString(),
        fingerprint,
        cruxCount,
        artifactCount,
        author,
      },
      null,
      2,
    ),
  );

  const templates = await db.all<{ template: string }>(
    "SELECT DISTINCT json_extract(meta, '$.template') AS template FROM cruxes WHERE json_extract(meta, '$.template') IS NOT NULL",
  );
  await referenceArchiveRuntimes(
    zip,
    templates.map((row) => row.template),
    options.runtime ?? archiveRuntimeMode(),
  );
  onProgress?.('Compressing...');
  const blob = await zip.generateAsync({ type: 'blob' });

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const filename = `crux-garden-${ts}.garden`;

  return { blob, filename };
}

// ── Import ──────────────────────────────────────────────

export async function importGarden(options: GardenImportOptions): Promise<GardenImportResult> {
  const { data, onProgress } = options;
  const raw = await toArrayBuffer(data);
  const db = getSqliteClient();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(raw);
  } catch (cause) {
    throw new Error('Invalid .garden file: expected a current ZIP archive.', { cause });
  }
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid .garden file: missing manifest.json');
  const manifest = JSON.parse(await manifestFile.async('text'));
  if (String(manifest.version ?? '').split('.')[0] !== SUPPORTED_MANIFEST_MAJOR)
    throw new Error(
      `Unsupported .garden format version "${manifest.version}". This app supports v${SUPPORTED_MANIFEST_MAJOR}.x.`,
    );
  if (manifest.scope !== 'installation')
    throw new Error('Invalid .garden file: expected an installation backup.');
  const sqliteFile = zip.file('garden.sqlite');
  if (!sqliteFile) throw new Error('Invalid .garden file: missing garden.sqlite');
  if (
    !/^[a-f0-9]{64}$/.test(manifest.fingerprint) ||
    !Number.isSafeInteger(manifest.artifactCount) ||
    manifest.artifactCount < 0
  )
    throw new Error('Invalid .garden integrity metadata.');
  onProgress?.('Extracting database...');
  const sqliteData = await sqliteFile.async('arraybuffer');
  if ((await hashContent(new Uint8Array(sqliteData))) !== manifest.fingerprint)
    throw new Error(
      'Garden file integrity check failed — the database may be corrupted or tampered with.',
    );
  await hydrateArchiveRuntimes(zip);
  const entries: { fingerprint: string; entry: JSZip.JSZipObject }[] = [];
  zip.folder('artifacts')?.forEach((fingerprint, entry) => {
    if (!entry.dir) entries.push({ fingerprint, entry });
  });
  if (entries.length !== manifest.artifactCount)
    throw new Error(
      `Artifact count mismatch: manifest says ${manifest.artifactCount}, but archive contains ${entries.length}. The archive may be incomplete.`,
    );
  for (const { fingerprint, entry } of entries) {
    const bytes = await entry.async('uint8array');
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || (await hashContent(bytes)) !== fingerprint)
      throw new Error(
        'Artifact blob failed integrity check — file contents do not match their fingerprint.',
      );
  }
  // Stage verified immutable objects before traversing manifests. Restrict that
  // traversal to this archive's inventory so existing cache cannot hide a hole.
  // A refused intake may retain staged objects; it never wipes current content.
  for (let i = 0; i < entries.length; i++) {
    const { fingerprint, entry } = entries[i]!;
    onProgress?.(`Preparing content ${i + 1}/${entries.length}...`);
    await db.blobWrite(fingerprint, await entry.async('uint8array'));
  }
  onProgress?.('Checking required content...');
  const available = entries.map((entry) => entry.fingerprint);
  const fingerprints = await db.inspectImport(sqliteData, available);
  const missing = fingerprints.filter((fingerprint) => !zip.file(`artifacts/${fingerprint}`));
  if (missing.length)
    throw new Error(`Garden archive is missing required content (${missing.length} blob(s)).`);
  for (const fingerprint of fingerprints) {
    let bytes: Uint8Array;
    try {
      bytes = await db.blobRead(fingerprint);
    } catch (cause) {
      throw new Error(`Garden restore is missing required content: ${fingerprint}`, { cause });
    }
    if ((await hashContent(bytes)) !== fingerprint)
      throw new Error(`Garden restore content failed integrity check: ${fingerprint}`);
  }

  await (await import('@/stores/workspaceRegistry')).prepareGardenReplacement();
  onProgress?.('Creating safety backup...');
  // An empty garden still has a valid database image. An export failure is
  // never evidence that there is nothing to preserve.
  const backupSqlite = await db.export();
  try {
    onProgress?.('Importing database...');
    await db.import(sqliteData);
    if (db.installation) {
      // Desktop: another machine's sessions, folders and live reviews go at once.
      await db.installation.sanitizeImportedGarden();
    } else {
      // Provider sessions belong to the exporting installation, including Main's.
      await db.run(`UPDATE cruxes SET meta = json_remove(meta,
    '$.settings.agentSessionId', '$.settings.agentSessions', '$.settings.agentHost', '$.agentHost', '$.turnJob', '$.turnQueue')
    WHERE meta IS NOT NULL`);

      // A restored task always gets a fresh directory and provider session.
      const { portableMeta } = await import('./task-archive');
      const copies = await db.all<{ id: string; meta: string }>(
        'SELECT id, meta FROM working_copies',
      );
      for (const copy of copies)
        await db.run('UPDATE working_copies SET project_folder = NULL, meta = ? WHERE id = ?', [
          JSON.stringify(portableMeta(copy.meta)),
          copy.id,
        ]);
      // Reviews cannot carry a live preview across installations. Keep the JSON
      // journal consistent with its indexed phase, including restored data.
      await db.run(`UPDATE task_merges SET phase = 'cancelled',
      data = CASE WHEN json_valid(data) AND json_type(data) = 'object'
        THEN json_remove(json_set(data, '$.phase', 'cancelled'), '$.previewUrl') ELSE data END
      WHERE phase = 'review' OR (phase = 'cancelled' AND json_extract(data, '$.phase') = 'review')`);
    }
  } catch (error) {
    onProgress?.('Import failed — restoring previous data...');
    try {
      await db.import(backupSqlite);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        'Garden import failed and its database could not be restored. Existing content files have been retained.',
        { cause: recoveryError },
      );
    }
    throw error;
  }

  // Desktop: materialize into fresh folders even on the exporting machine.
  // Existing folders may hold different work and must remain intact (no-op on web).
  onProgress?.('Setting up project folders...');
  try {
    const { rehomeProjectFolders } = await import('./project-folder');
    const rehomed = await rehomeProjectFolders((done, total) =>
      onProgress?.(`Setting up project folders (${done}/${total})...`),
    );
    if (rehomed > 0) console.info(`[garden] re-homed ${rehomed} project folder(s)`);
  } catch (err) {
    // The store is intact either way — folders can be restored per-crux later.
    console.error('[garden] project folder re-homing failed:', err);
  }

  // Get counts from the imported database
  const cruxCountRow = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM cruxes WHERE type = 'workspace'",
  );

  onProgress?.('Import complete');

  return {
    cruxCount: cruxCountRow?.count ?? 0,
    artifactCount: fingerprints.length,
  };
}

// ── Confirm + Import ────────────────────────────────────
// Shared safety flow used by both file import (DataSettings)
// and cloud pull (SyncSettings). Returns false if the user cancelled.

export interface ConfirmAndImportOptions {
  data: Blob | ArrayBuffer;
  onProgress?: (status: string) => void;
  /** Called after successful import to reconcile auth state */
  onPostImport?: () => Promise<void>;
  /** Ask the user a yes/no question. Defaults to the app's dialog; tests inject their own. */
  confirm?: (message: string) => Promise<boolean>;
}

async function defaultConfirm(message: string): Promise<boolean> {
  const { confirmDialog } = await import('@/stores/dialogStore');
  return confirmDialog({ message, confirmLabel: 'Continue', danger: true });
}

export async function confirmAndImportGarden(options: ConfirmAndImportOptions): Promise<boolean> {
  const { data, onProgress, onPostImport } = options;
  const confirm = options.confirm ?? defaultConfirm;

  // Offer to export current garden as a backup first
  const wantBackup = await confirm(
    'Importing a garden will replace ALL existing data.\n\nWould you like to export your current garden first as a backup?',
  );
  if (wantBackup) {
    try {
      const backup = await exportGarden({ onProgress, runtime: 'included' });
      const url = URL.createObjectURL(backup.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backup.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup export failed:', err);
      const proceed = await confirm('Backup export failed. Continue with import anyway?');
      if (!proceed) return false;
    }
  }

  // Final confirmation
  if (!(await confirm('This will replace your entire garden. Continue?'))) return false;

  await importGarden({ data, onProgress });
  await onPostImport?.();

  onProgress?.('Redirecting...');
  setTimeout(() => {
    window.location.href = '/';
  }, 600);

  return true;
}
