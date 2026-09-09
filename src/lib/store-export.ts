/**
 * The Crux Store as a file — the same document the API exports and imports
 * (api/src/crux-store/store-export.ts), so data moves between the workspace's
 * local store and the published crux's live store, and survives an unshare.
 *
 *   { format: "crux-store", version: 1, cruxId, exportedAt,
 *     public:    { key: value },
 *     protected: { visitorId: { key: value } } }
 */
export const STORE_EXPORT_FORMAT = 'crux-store';
export const STORE_EXPORT_VERSION = 1;

export interface StoreExport {
  format: typeof STORE_EXPORT_FORMAT;
  version: typeof STORE_EXPORT_VERSION;
  cruxId: string;
  exportedAt: string;
  public: Record<string, unknown>;
  protected: Record<string, Record<string, unknown>>;
}

export interface StoreRowLike {
  key: string;
  value: unknown;
  visitorId: string | null;
  /** A protected row with no visitor (the workspace's own slot) keeps its mode under `protected.local`. */
  mode?: 'public' | 'protected';
}

/** The visitor id that stands for "this workspace, no account" in a document. */
export const LOCAL_VISITOR = 'local';

export interface StoreImportEntry {
  key: string;
  value: unknown;
  mode: 'public' | 'protected';
  visitorId: string | null;
}

export function toStoreExport(cruxId: string, rows: StoreRowLike[], now = new Date()): StoreExport {
  const out: StoreExport = {
    format: STORE_EXPORT_FORMAT,
    version: STORE_EXPORT_VERSION,
    cruxId,
    exportedAt: now.toISOString(),
    public: {},
    protected: {},
  };
  for (const r of rows) {
    if (r.visitorId) (out.protected[r.visitorId] ??= {})[r.key] = r.value;
    else if (r.mode === 'protected') (out.protected[LOCAL_VISITOR] ??= {})[r.key] = r.value;
    else out.public[r.key] = r.value;
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate an uploaded document; throws a plain Error with a message fit for the pane. */
export function parseStoreExport(input: unknown): StoreExport {
  if (!isRecord(input)) throw new Error('That file is not a JSON object');
  if (input.format !== STORE_EXPORT_FORMAT) throw new Error('That file is not a Crux Store export');
  if (input.version !== STORE_EXPORT_VERSION)
    throw new Error(`Unsupported export version ${String(input.version)}`);
  const pub = input.public ?? {};
  const prot = input.protected ?? {};
  if (!isRecord(pub) || !isRecord(prot))
    throw new Error('"public" and "protected" must be objects');
  for (const [visitorId, values] of Object.entries(prot)) {
    if (!visitorId || !isRecord(values))
      throw new Error(`"protected" must map visitor ids to objects (at "${visitorId}")`);
  }
  return {
    format: STORE_EXPORT_FORMAT,
    version: STORE_EXPORT_VERSION,
    cruxId: typeof input.cruxId === 'string' ? input.cruxId : '',
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : '',
    public: pub,
    protected: prot as Record<string, Record<string, unknown>>,
  };
}

export function storeExportEntries(doc: StoreExport): StoreImportEntry[] {
  const entries: StoreImportEntry[] = [];
  for (const [key, value] of Object.entries(doc.public))
    entries.push({ key, value, mode: 'public', visitorId: null });
  for (const [visitorId, values] of Object.entries(doc.protected))
    for (const [key, value] of Object.entries(values))
      entries.push({ key, value, mode: 'protected', visitorId });
  return entries;
}

export function storeExportFilename(cruxTitle: string | undefined, live: boolean): string {
  const slug = (cruxTitle || 'crux')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'crux'}-store-${live ? 'live' : 'local'}-${new Date().toISOString().slice(0, 10)}.json`;
}
