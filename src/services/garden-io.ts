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

  // Get unique fingerprints with one representative artifact ID each
  const fingerprintRows = await db.all<{ fingerprint: string; id: string }>(
    'SELECT fingerprint, MIN(id) as id FROM artifacts WHERE fingerprint IS NOT NULL GROUP BY fingerprint',
  );

  const zip = new JSZip();

  // garden.sqlite
  zip.file('garden.sqlite', sqliteData);

  // Artifact blobs keyed by fingerprint
  let artifactCount = 0;
  for (let i = 0; i < fingerprintRows.length; i++) {
    const { fingerprint, id } = fingerprintRows[i]!;
    onProgress?.(`Extracting artifact ${i + 1}/${fingerprintRows.length}...`);

    try {
      const row = await db.get<{ content: Uint8Array }>(
        'SELECT content FROM artifacts WHERE id = ?',
        [id],
      );
      if (row?.content) {
        zip.file(`artifacts/${fingerprint}`, row.content);
        artifactCount++;
      }
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

  // Try ZIP format first; fall back to legacy raw SQLite
  let sqliteData: ArrayBuffer;
  let isZip = true;

  try {
    const zip = await JSZip.loadAsync(raw);

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

    // Verify fingerprint if present
    if (manifest.fingerprint) {
      onProgress?.('Verifying integrity...');
      const actualFingerprint = await hashContent(new Uint8Array(sqliteData));
      if (actualFingerprint !== manifest.fingerprint) {
        throw new Error('Garden file integrity check failed — the database may be corrupted or tampered with.');
      }
    }
  } catch (err) {
    // If JSZip fails to parse, this might be a legacy raw SQLite file
    if (err instanceof Error && (err.message.includes('not a valid zip') || err.message.includes('Corrupted zip') || err.message.includes('end of central directory'))) {
      isZip = false;
      sqliteData = raw;
      onProgress?.('Detected legacy format...');
    } else {
      throw err;
    }
  }

  onProgress?.('Importing database...');
  await getSqliteClient().import(sqliteData);

  // Get counts from the imported database
  const db = getSqliteClient();
  const cruxCountRow = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM cruxes WHERE type = 'workspace'",
  );
  const artifactCountRow = await db.get<{ count: number }>(
    'SELECT COUNT(DISTINCT fingerprint) as count FROM artifacts WHERE fingerprint IS NOT NULL',
  );

  if (!isZip) {
    onProgress?.('Legacy import complete');
  } else {
    onProgress?.('Import complete');
  }

  return {
    cruxCount: cruxCountRow?.count ?? 0,
    artifactCount: artifactCountRow?.count ?? 0,
  };
}
