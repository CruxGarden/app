import type { SqliteBridge } from './bridge';
type Awaitable<T> = T | Promise<T>;

/** Host storage boundary. Consumers await results before using them, whether
 * supplied by the legacy native client or the queued local API owner. */
export interface NativeStorage {
  run(sql: string, params?: unknown[]): Awaitable<{ changes: number }>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Awaitable<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Awaitable<T[]>;
  /** Available when the owning backend can commit the complete metadata merge. */
  mergeCruxMeta?(id: string, patch: Record<string, unknown>): Promise<void>;
  updateCrux?: SqliteBridge['updateCrux'];
  export(): Awaitable<ArrayBuffer>;
  import(data: ArrayBuffer): Awaitable<void>;
  /** External content required beyond any supported inline payloads. */
  inspectImport(data: ArrayBuffer): Awaitable<string[]>;
  close(): Awaitable<void>;
  blobWrite(fingerprint: string, data: Uint8Array): Awaitable<void>;
  blobRead(fingerprint: string): Awaitable<Uint8Array>;
  blobDelete(fingerprint: string): Awaitable<void>;
  blobExists(fingerprint: string): Awaitable<boolean>;
  blobWipeAll(): Awaitable<void>;
}

/** Resolve native work to its actual Main or ready Task copy, never to the
 * currently selected UI route. Deleted owners and unavailable copies refuse. */
export async function lookupProjectCrux(db: Pick<NativeStorage, 'get'>, cruxId: string) {
  const row = await db.get<{ slug: string; title: string | null; meta: string | null }>(
    'SELECT slug, title, meta FROM cruxes WHERE id = ? AND deleted IS NULL',
    [cruxId],
  );
  if (!row) {
    const copy = await db.get<{ project_folder: string | null; title: string }>(
      "SELECT w.project_folder, w.title FROM working_copies w JOIN cruxes c ON c.id = w.crux_id WHERE w.id = ? AND w.phase = 'ready' AND w.role = 'task' AND c.deleted IS NULL",
      [cruxId],
    );
    return copy?.project_folder
      ? { slug: `task-${cruxId}`, title: copy.title, folder: copy.project_folder }
      : null;
  }
  try {
    const meta = JSON.parse(row.meta || '{}');
    if (typeof meta.projectFolder !== 'string') return null;
    return { slug: row.slug, title: row.title || '', folder: meta.projectFolder };
  } catch {
    return null;
  }
}
