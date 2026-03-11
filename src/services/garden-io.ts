import JSZip from 'jszip';
import { getSqliteClient } from './sqlite/client';
import { hashContent } from './sqlite/helpers';

// ── Constants ────────────────────────────────────────────

const SUPPORTED_MANIFEST_MAJOR = '1';

// ── Types ───────────────────────────────────────────────

export interface GardenExportOptions {
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

const ALL_TABLES = ['cruxes', 'artifacts', 'dimensions', 'authors', 'settings'];

export async function wipeGarden(onProgress?: (status: string) => void): Promise<void> {
  const db = getSqliteClient();

  onProgress?.('Deleting all data...');
  for (const table of ALL_TABLES) {
    await db.run(`DELETE FROM ${table}`);
  }

  onProgress?.('Removing all files...');
  await db.blobWipeAll();

  onProgress?.('Wipe complete');
}

// ── Export ───────────────────────────────────────────────

export async function exportGarden(options: GardenExportOptions = {}): Promise<GardenExportResult> {
  const { author = null, onProgress } = options;
  const db = getSqliteClient();

  onProgress?.('Exporting database...');
  const sqliteData = await db.export();

  onProgress?.('Collecting artifacts...');

  // Get counts
  const cruxCountRow = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM cruxes WHERE type = 'workspace'",
  );
  const cruxCount = cruxCountRow?.count ?? 0;

  // Get unique fingerprints from all artifacts
  const fingerprintRows = await db.all<{ fingerprint: string }>(
    'SELECT DISTINCT fingerprint FROM artifacts WHERE fingerprint IS NOT NULL',
  );

  const zip = new JSZip();

  // garden.sqlite — metadata only (no content column)
  zip.file('garden.sqlite', sqliteData);

  // Artifact blobs from OPFS, keyed by fingerprint
  let artifactCount = 0;
  for (let i = 0; i < fingerprintRows.length; i++) {
    const { fingerprint } = fingerprintRows[i]!;
    onProgress?.(`Extracting artifact ${i + 1}/${fingerprintRows.length}...`);

    try {
      const bytes = await db.blobRead(fingerprint);
      zip.file(`artifacts/${fingerprint}`, bytes);
      artifactCount++;
    } catch (err) {
      console.warn(`Failed to extract artifact ${fingerprint}:`, err);
    }
  }

  // Compute fingerprint of the SQLite file
  onProgress?.('Computing integrity fingerprint...');
  const fingerprint = await hashContent(new Uint8Array(sqliteData));

  // manifest.json
  zip.file('manifest.json', JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    fingerprint,
    cruxCount,
    artifactCount,
    author,
  }, null, 2));

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

  // Try ZIP format first; fall back to legacy raw SQLite
  let sqliteData: ArrayBuffer;
  // eslint-disable-next-line no-useless-assignment -- reassigned in catch fallback
  let zip: JSZip | null = null;

  try {
    zip = await JSZip.loadAsync(raw);

    // Validate manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('Invalid .garden file: missing manifest.json');

    const manifest = JSON.parse(await manifestFile.async('text'));
    const majorVersion = String(manifest.version ?? '').split('.')[0];
    if (majorVersion !== SUPPORTED_MANIFEST_MAJOR) {
      throw new Error(
        `Unsupported .garden format version "${manifest.version}". This app supports v${SUPPORTED_MANIFEST_MAJOR}.x.`,
      );
    }

    // Extract garden.sqlite
    const sqliteFile = zip.file('garden.sqlite');
    if (!sqliteFile) throw new Error('Invalid .garden file: missing garden.sqlite');

    onProgress?.('Extracting database...');
    sqliteData = await sqliteFile.async('arraybuffer');

    // Verify SQLite fingerprint
    if (manifest.fingerprint) {
      onProgress?.('Verifying database integrity...');
      const actualFingerprint = await hashContent(new Uint8Array(sqliteData));
      if (actualFingerprint !== manifest.fingerprint) {
        throw new Error('Garden file integrity check failed — the database may be corrupted or tampered with.');
      }
    }

    // Verify artifact blob integrity — each file in artifacts/ should match its fingerprint name
    const artifactsFolder = zip.folder('artifacts');
    if (artifactsFolder) {
      const blobEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
      artifactsFolder.forEach((relativePath, entry) => {
        if (!entry.dir) blobEntries.push({ name: relativePath, entry });
      });

      if (blobEntries.length > 0) {
        onProgress?.(`Validating ${blobEntries.length} artifact blobs...`);
        const corrupted: string[] = [];
        for (let i = 0; i < blobEntries.length; i++) {
          const { name, entry } = blobEntries[i]!;
          onProgress?.(`Validating blob ${i + 1}/${blobEntries.length}...`);
          const ab = await entry.async('arraybuffer');
          const actualHash = await hashContent(new Uint8Array(ab));
          if (actualHash !== name) {
            corrupted.push(name);
          }
        }
        if (corrupted.length > 0) {
          throw new Error(
            `${corrupted.length} artifact blob(s) failed integrity check — file contents do not match their fingerprint. The archive may be corrupted.`,
          );
        }
      }
    }

    // Verify expected artifact count matches manifest
    if (typeof manifest.artifactCount === 'number') {
      let actualBlobCount = 0;
      zip.folder('artifacts')?.forEach((_, entry) => { if (!entry.dir) actualBlobCount++; });
      if (actualBlobCount !== manifest.artifactCount) {
        throw new Error(
          `Artifact count mismatch: manifest says ${manifest.artifactCount}, but archive contains ${actualBlobCount}. The archive may be incomplete.`,
        );
      }
    }
  } catch (err) {
    // If JSZip fails to parse, this might be a legacy raw SQLite file
    if (err instanceof Error && (err.message.includes('not a valid zip') || err.message.includes('Corrupted zip') || err.message.includes('end of central directory'))) {
      zip = null;
      sqliteData = raw;
      onProgress?.('Detected legacy format...');
    } else {
      throw err;
    }
  }

  // ── Safety backup ─────────────────────────────────────
  // Snapshot current SQLite + blob fingerprints before destructive import.
  // If anything fails after db.import(), we can restore the original state.
  onProgress?.('Creating safety backup...');
  // eslint-disable-next-line no-useless-assignment -- used in catch rollback block
  let backupSqlite: ArrayBuffer | null = null;
  // eslint-disable-next-line no-useless-assignment -- fingerprints used indirectly via backupBlobs loop
  let backupFingerprints: string[] = [];
  const backupBlobs = new Map<string, Uint8Array>();

  try {
    backupSqlite = await db.export();
    const fpRows = await db.all<{ fingerprint: string }>(
      'SELECT DISTINCT fingerprint FROM artifacts WHERE fingerprint IS NOT NULL',
    );
    backupFingerprints = fpRows.map((r) => r.fingerprint);
    for (const fp of backupFingerprints) {
      try {
        backupBlobs.set(fp, await db.blobRead(fp));
      } catch {
        // Blob missing — skip (can't back up what doesn't exist)
      }
    }
  } catch {
    // Empty garden — nothing to back up, that's fine
    backupSqlite = null;
  }

  // ── Destructive import ────────────────────────────────
  try {
    onProgress?.('Importing database...');
    await db.import(sqliteData);

    // Wipe existing blobs so orphaned files from the old garden don't linger
    await db.blobWipeAll();

    // Restore OPFS blobs from the ZIP's artifacts/ directory
    if (zip) {
      const artifactsFolder = zip.folder('artifacts');
      if (artifactsFolder) {
        const entries: { fingerprint: string; entry: JSZip.JSZipObject }[] = [];
        artifactsFolder.forEach((relativePath, entry) => {
          if (!entry.dir) {
            entries.push({ fingerprint: relativePath, entry });
          }
        });

        onProgress?.(`Restoring ${entries.length} artifact blobs...`);
        for (let i = 0; i < entries.length; i++) {
          const { fingerprint, entry } = entries[i]!;
          onProgress?.(`Restoring blob ${i + 1}/${entries.length}...`);
          const ab = await entry.async('arraybuffer');
          await db.blobWrite(fingerprint, new Uint8Array(ab));
        }
      }
    }
  } catch (err) {
    // ── Rollback: restore original database + blobs ────
    onProgress?.('Import failed — restoring previous data...');
    if (backupSqlite) {
      try {
        await db.import(backupSqlite);
        await db.blobWipeAll();
        for (const [fp, bytes] of backupBlobs) {
          await db.blobWrite(fp, bytes);
        }
      } catch (restoreErr) {
        console.error('Failed to restore backup after import failure:', restoreErr);
      }
    }
    throw err;
  }

  // Get counts from the imported database
  const cruxCountRow = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM cruxes WHERE type = 'workspace'",
  );
  const artifactCountRow = await db.get<{ count: number }>(
    'SELECT COUNT(DISTINCT fingerprint) as count FROM artifacts WHERE fingerprint IS NOT NULL',
  );

  onProgress?.('Import complete');

  return {
    cruxCount: cruxCountRow?.count ?? 0,
    artifactCount: artifactCountRow?.count ?? 0,
  };
}
