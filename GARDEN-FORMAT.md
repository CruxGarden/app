# The .garden Export Format

Version 1.0 — Last updated 2026-03-08

## Overview

A `.garden` file is a ZIP archive that contains a complete backup of your entire Crux Garden — every workspace, artifact, conversation, snapshot, and setting. It captures the full SQLite database plus all unique artifact blobs as separate files.

The file extension is `.garden`, but it is a standard ZIP file and can be opened with any ZIP tool.

For the single-workspace export format, see [CRUX-FORMAT.md](./CRUX-FORMAT.md).

## Why it exists

The `.crux` format exports a single workspace. The `.garden` format exports **everything** — your entire local database. Use it for:

- **Full backup** of all your work in a single file
- **Device migration** — move your entire garden to a new browser or machine
- **Disaster recovery** — restore from a complete backup if OPFS data is lost
- **Archival** — snapshot your entire creative history

## How it differs from .crux

| | `.crux` | `.garden` |
|---|---------|-----------|
| Scope | One workspace + its snapshots | Entire database (all workspaces, all data) |
| Format | JSON manifests + artifact blobs | SQLite database + artifact blobs |
| Import mode | Restore / Replace / Clone | Full database replacement |
| Conflict handling | Per-workspace conflict UI | Replaces everything |
| Use case | Share, transfer, back up one crux | Back up or migrate your whole garden |

---

## File structure

```
crux-garden-20260308.garden
├── manifest.json              # Format version, metadata, integrity
├── garden.sqlite              # Complete SQLite database
└── artifacts/
    ├── a1b2c3d4e5f6...        # Artifact blob, named by SHA-256 fingerprint
    ├── f6e5d4c3b2a1...        # Another artifact blob
    └── ...                    # One entry per unique fingerprint
```

---

## File-by-file specification

### manifest.json

The entry point. Validators should read this first.

```json
{
  "version": "1.0",
  "exportedAt": "2026-03-08T14:30:00.000Z",
  "fingerprint": "sha256-hex-of-garden-sqlite",
  "cruxCount": 12,
  "artifactCount": 47,
  "author": {
    "username": "daniel",
    "displayName": "Daniel"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Format version. The importer checks the **major** version only — `"1.0"`, `"1.1"`, `"1.99"` are all accepted. A major version mismatch (e.g. `"2.0"`) is rejected. |
| `exportedAt` | `string` | ISO 8601 timestamp of when the export was created. |
| `fingerprint` | `string` | SHA-256 hex hash of the `garden.sqlite` file bytes. Used for integrity verification — detects corruption or tampering during transfer. |
| `cruxCount` | `number` | Number of workspace cruxes (`type = 'workspace'`) in the database at export time. |
| `artifactCount` | `number` | Number of unique artifact blobs in the `artifacts/` directory. Deduplicated by fingerprint — if the same file content appears across multiple workspaces, it is stored once. |
| `author` | `object \| null` | The author who exported the file. Contains `username` and `displayName`. Null if exported without author info. |

**Validation rules:**
- `manifest.json` is **required**. A ZIP without it is rejected.
- `version` is required. The importer splits on `.` and compares the first segment to `"1"`.
- If `fingerprint` is present, the importer computes SHA-256 of the extracted `garden.sqlite` and rejects the import if they don't match.

---

### garden.sqlite

The complete SQLite database, exported via the `export()` method on the SQLite client. This is a binary SQLite database file containing all tables, indexes, and data.

On import, this file replaces the entire local database. The importer calls `import(data)` on the SQLite client, which:

1. Closes the current database
2. Opens a new database from the imported bytes
3. Runs the schema DDL to ensure all tables and indexes exist (handles forward-compatible schema additions)

**This is a destructive operation** — all existing local data is replaced. The UI should warn the user and recommend exporting a backup before importing.

---

### artifacts/ directory

Contains the raw file blobs, named by their SHA-256 fingerprint (hex-encoded, no extension). This is the same content-addressable storage scheme used by the `.crux` format.

```
artifacts/
├── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
├── d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592
└── 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

**Why artifacts are stored outside the SQLite file:**

The SQLite database stores artifact content as BLOBs in the `artifacts.content` column. The `.garden` format extracts these BLOBs into separate files for two reasons:

1. **Deduplication** — The same content may be stored in multiple artifact rows (e.g. a file shared across workspaces, or cloned to snapshots). Extracting by fingerprint stores each unique blob once.
2. **Database size** — A future optimization could strip BLOBs from the SQLite file itself, dramatically reducing the database size. The artifacts directory would then be the canonical blob store.

On export, the exporter queries `SELECT fingerprint, MIN(id) as id FROM artifacts WHERE fingerprint IS NOT NULL GROUP BY fingerprint` to find one representative row per unique fingerprint, then reads its content blob.

---

## Export process

1. **Export SQLite** — Call `db.export()` to get the full database as an ArrayBuffer.
2. **Collect artifact fingerprints** — Query for unique fingerprints across all artifacts.
3. **Extract blobs** — For each unique fingerprint, read the content blob from the database and add it to the ZIP as `artifacts/{fingerprint}`.
4. **Compute integrity fingerprint** — SHA-256 hash of the exported SQLite bytes.
5. **Count entities** — Query for workspace count and unique artifact count.
6. **Build manifest** — Write `manifest.json` with version, timestamp, fingerprint, counts, and author.
7. **Compress** — Generate the ZIP blob.
8. **Name the file** — `crux-garden-{YYYYMMDD}.garden`.

---

## Import process

1. **Try ZIP parse** — Attempt to load the file as a ZIP with JSZip.
2. **If ZIP parse fails** — Check if the error indicates a non-ZIP file. If so, treat the raw bytes as a legacy SQLite database (pre-1.0 format) and skip to step 6.
3. **Validate manifest** — Require `manifest.json`, check major version is `"1"`.
4. **Extract garden.sqlite** — Read the database file from the ZIP. Required.
5. **Verify integrity** — If `manifest.fingerprint` is present, compute SHA-256 of the extracted SQLite bytes and reject if they don't match.
6. **Import database** — Call `db.import(sqliteData)` to replace the local database.
7. **Count results** — Query the imported database for workspace count and unique artifact count.
8. **Return result** — `{ cruxCount, artifactCount }`.

**Post-import steps** (handled by the UI):
- Re-ensure local author exists (`ensureLocalAuthor()`) — the imported database may not have the current device's author.
- Refresh the garden view to reflect the new data.
- Recommend a page reload to clear any stale in-memory state.

---

## Legacy format support

Before the `.garden` ZIP format existed, the app exported raw SQLite database files with the `.garden` extension. The importer detects these by catching the JSZip parse error — if the file is not a valid ZIP, it is treated as a raw SQLite database and imported directly.

This ensures backward compatibility with older exports. The legacy path skips manifest validation and integrity verification.

---

## Filename convention

Export files are named:

```
crux-garden-{YYYYMMDD}.garden
```

Examples:
- `crux-garden-20260308.garden`
- `crux-garden-20260101.garden`

---

## Error handling summary

| Scenario | Behavior |
|----------|----------|
| Missing `manifest.json` | Import rejected with error |
| Unsupported format version | Import rejected with error |
| Missing `garden.sqlite` | Import rejected with error |
| Fingerprint mismatch | Import rejected with "integrity check failed" error |
| Not a ZIP file | Falls back to legacy raw SQLite import |
| Individual artifact blob fails to extract during export | Skipped with console warning, export continues |

---

## Where .garden is used

| Location | Action |
|----------|--------|
| Settings > Data > Export garden | Calls `exportGarden()`, downloads `.garden` file |
| Settings > Data > Import garden | Calls `importGarden()`, replaces database |
| Garden page > Import button | Detects `.garden` extension, routes to `importGarden()` instead of `importCrux()` |

---

## SQLite database schema

The `garden.sqlite` file contains the following tables. This is the canonical reference for what data lives inside a `.garden` export.

### Architecture

```
Browser Main Thread          Web Worker Thread
+-----------------+          +-------------------------+
|  React App      |          |  wa-sqlite (WASM)       |
|  +-----------+  |  message |  +-------------------+  |
|  | Services  |--|----------|--| SQLite Engine     |  |
|  +-----------+  |  queue   |  | +---------------+ |  |
|                 |          |  | | OPFS Storage  | |  |
|                 |<---------|--| +---------------+ |  |
|                 |  results |  +-------------------+  |
+-----------------+          +-------------------------+
```

- **Storage**: AccessHandlePoolVFS writes to OPFS (persistent across sessions)
- **Fallback**: MemoryAsyncVFS for transient operations (export/import staging)
- **Crash recovery**: Automatic WASM restart on memory or table bounds errors
- **Concurrency**: Message-based request queue with unique IDs per operation

---

### cruxes

The core entity. A crux is a creative workspace — it holds metadata about a project, a conversation, and the artifacts that were created within it. Snapshot cruxes (frozen copies of a workspace at a point in time) are also stored in this table.

```sql
CREATE TABLE IF NOT EXISTS cruxes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  data TEXT DEFAULT '',
  type TEXT DEFAULT 'crux',
  kind TEXT,
  status TEXT DEFAULT 'living',
  visibility TEXT DEFAULT 'private',
  author_id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  meta TEXT DEFAULT '{}',
  remote_id TEXT,
  synced_at TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cruxes_slug ON cruxes(slug);
CREATE INDEX IF NOT EXISTS idx_cruxes_author ON cruxes(author_id);
CREATE INDEX IF NOT EXISTS idx_cruxes_updated ON cruxes(updated);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID v4 primary key. Generated by `crypto.randomUUID()`. |
| `slug` | TEXT | Unique URL-safe identifier used in published URLs (`crux.garden/@user/slug`). Auto-generated from title on creation. |
| `title` | TEXT | Human-readable name displayed in the garden grid and workspace header. |
| `description` | TEXT | Optional description shown on the crux card. |
| `data` | TEXT | General-purpose text content field. Not currently used by workspaces. |
| `type` | TEXT | Entity type. `"workspace"` for user-created workspaces, `"crux"` for snapshots and other crux types. |
| `kind` | TEXT | Subtype that controls behavior. For workspaces: `"webapp"`, `"page"`, `"document"`, `"image"`, or `NULL` (auto-detect). For snapshots: `"snapshot"`. |
| `status` | TEXT | Lifecycle state. `"living"` (active, editable) or `"frozen"` (archived). |
| `visibility` | TEXT | Access control. `"private"`, `"public"`, or `"unlisted"`. |
| `author_id` | TEXT | UUID of the author who owns this crux. Set from the local identity on creation. |
| `home_id` | TEXT | UUID of the home (workspace container). Set from the local identity. |
| `meta` | TEXT | JSON object for extensible metadata. See **meta fields** below. |
| `remote_id` | TEXT | UUID of this crux on the remote API server (for future sync). |
| `synced_at` | TEXT | ISO 8601 timestamp of last sync with remote (for future sync). |
| `created` | TEXT | ISO 8601 creation timestamp. |
| `updated` | TEXT | ISO 8601 last-modified timestamp. |

**meta fields** (stored as JSON in the `meta` column):

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `ChatMessage[]` | The full AI conversation history for this workspace. |
| `summary` | `object` | AI-generated summary with `title`, `description`, `purpose`, `techStack`, etc. |
| `growthCount` | `number` | Number of snapshots (growth dimensions) for this workspace. |
| `settings` | `object` | Per-crux settings including `palette` (CSS custom property overrides). |
| `kind` | `string` | Duplicated from the `kind` column for compatibility with older data shapes. |
| `snapshot` | `object` | For snapshot cruxes: metadata about when/why the snapshot was taken. |
| `fingerprint` | `string` | SHA-256 artifact state fingerprint (set on snapshots). |
| `parentCruxId` | `string` | For snapshots: the workspace crux this snapshot belongs to. |
| `artifactRefs` | `object` | For snapshots: lightweight artifact manifest without content. |

---

### artifacts

File storage. Every artifact belongs to a crux (via `resource_id`). File content is stored in OPFS blobs (`crux-blobs/{fingerprint}`), not in the SQLite `content` column. The `content` column exists in the schema but is unused — OPFS is the canonical blob store. The `fingerprint` column links metadata to the OPFS blob.

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'artifact',
  kind TEXT DEFAULT 'file',
  meta TEXT DEFAULT '{}',
  resource_id TEXT NOT NULL,
  resource_type TEXT DEFAULT 'crux',
  author_id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  encoding TEXT DEFAULT 'utf-8',
  mime_type TEXT,
  filename TEXT,
  size INTEGER DEFAULT 0,
  fingerprint TEXT,
  path TEXT,
  content BLOB,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_resource_path
  ON artifacts(resource_id, path)
  WHERE path IS NOT NULL AND path != '';
CREATE INDEX IF NOT EXISTS idx_artifacts_resource ON artifacts(resource_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_fingerprint ON artifacts(fingerprint);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID v4 primary key. |
| `type` | TEXT | Always `"artifact"`. |
| `kind` | TEXT | Always `"file"`. |
| `meta` | TEXT | JSON metadata. Contains `{ "path": "src/index.html" }` — the virtual file path in the workspace. |
| `resource_id` | TEXT | UUID of the crux this artifact belongs to. Foreign key to `cruxes.id`. |
| `resource_type` | TEXT | Always `"crux"`. |
| `author_id` | TEXT | UUID of the author who created this artifact. |
| `home_id` | TEXT | UUID of the home. |
| `encoding` | TEXT | `"utf-8"` for text files, `"binary"` for images/fonts/etc. |
| `mime_type` | TEXT | MIME type string (e.g. `"text/html"`, `"image/png"`). Auto-detected from filename on upload. |
| `filename` | TEXT | Original filename (e.g. `"index.html"`). The last segment of the path. |
| `size` | INTEGER | File size in bytes. |
| `fingerprint` | TEXT | SHA-256 hex hash of the file content. Used for deduplication in exports and snapshot cloning. |
| `path` | TEXT | Internal storage path. Matches `meta.path`. Used by the unique index for dedup-by-path. |
| `content` | BLOB | Legacy column — unused. File content lives in OPFS at `crux-blobs/{fingerprint}`. |
| `created` | TEXT | ISO 8601 creation timestamp. |
| `updated` | TEXT | ISO 8601 last-modified timestamp. |

---

### dimensions

Directional relationships between cruxes. Only **growth** is actively used.

```sql
CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  kind TEXT,
  weight REAL,
  author_id TEXT,
  home_id TEXT NOT NULL,
  note TEXT,
  meta TEXT DEFAULT '{}',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dimensions_source ON dimensions(source_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_target ON dimensions(target_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_source_type ON dimensions(source_id, type);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID v4 primary key. |
| `source_id` | TEXT | UUID of the source crux. For growth dimensions, this is the workspace. |
| `target_id` | TEXT | UUID of the target crux. For growth dimensions, this is the snapshot. |
| `type` | TEXT | One of: `"growth"`, `"garden"`, `"graft"`. Only `"growth"` is actively used. |
| `weight` | REAL | Ordering weight. For growth dimensions, this is the 1-based snapshot index. |
| `author_id` | TEXT | UUID of the author. |
| `home_id` | TEXT | UUID of the home. |
| `note` | TEXT | Optional text annotation. |
| `meta` | TEXT | JSON metadata. |
| `created` | TEXT | ISO 8601 creation timestamp. |
| `updated` | TEXT | ISO 8601 last-modified timestamp. |

---

### authors

Local author identity. Every device has exactly one local author, auto-generated on first launch.

```sql
CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  account_id TEXT,
  home_id TEXT,
  meta TEXT DEFAULT '{}',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID v4 primary key. |
| `username` | TEXT | Unique username. Auto-generated as `"wanderer-{shortId}"` for local authors. |
| `display_name` | TEXT | Human-readable display name. |
| `bio` | TEXT | Author biography. |
| `account_id` | TEXT | UUID linking to an account (for future remote auth). |
| `home_id` | TEXT | UUID of the author's home space. |
| `meta` | TEXT | JSON metadata. May contain `avatarUrl`. |
| `created` | TEXT | ISO 8601 creation timestamp. |
| `updated` | TEXT | ISO 8601 last-modified timestamp. |

---

### settings

Key-value store for app configuration and persisted state.

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

| Key | Example value | Description |
| --- | ------------- | ----------- |
| `cruxgarden:local:authorId` | UUID | The local author's ID |
| `cruxgarden:local:homeId` | UUID | The local home space ID |
| `cruxgarden:localAuthorId` | UUID | The ensured local author record ID |
| `cruxgarden:backend` | `"local"` | Backend mode (`"local"` or `"api"`) |
| `cruxgarden:theme` | `"dark"` | UI theme mode |
| `cruxgarden:tint` | `"green"` | Accent color |
| `cruxgarden:backgroundType` | `"mesh"` | Background style |
| `cruxgarden:apiKey:{providerId}` | string | User's API key (e.g. `cruxgarden:apiKey:anthropic`) |
| `cruxgarden:defaultModel` | `"claude-sonnet-4-20250514"` | User's selected default AI model |

All settings keys are prefixed with `cruxgarden:`. A migration in `initSettings()` renames any legacy unprefixed keys on startup.

---

### store

Per-crux key-value store. Enables persistent data in published cruxes (view counters, user preferences, game saves, etc.).

```sql
CREATE TABLE IF NOT EXISTS store (
  id TEXT PRIMARY KEY,
  crux_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'protected',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_crux_key
  ON store(crux_id, key);
CREATE INDEX IF NOT EXISTS idx_store_crux ON store(crux_id);
```

| Column | Type | Description |
| ------ | ---- | ----------- |
| `id` | TEXT | UUID v4 primary key. |
| `crux_id` | TEXT | UUID of the crux this entry belongs to. |
| `key` | TEXT | Store key name (e.g. `"views"`, `"user-prefs"`). |
| `value` | TEXT | JSON-serialized value. |
| `mode` | TEXT | `"public"` (one shared value per key) or `"protected"` (per-visitor, requires auth). |
| `created` | TEXT | ISO 8601 creation timestamp. |
| `updated` | TEXT | ISO 8601 last-modified timestamp. |

---

### schema_version

Tracks the database schema version for future migrations.

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
```

Current version: **1**.

---

## Entity relationships

```
                    +-------------+
                    |   authors   |
                    |  (1 local)  |
                    +------+------+
                           | author_id
              +------------+------------+
              v            v            v
        +----------+ +----------+ +------------+
        |  cruxes  | |  cruxes  | | dimensions |
        |(workspace| |(snapshot)| |  (growth)  |
        |  type=   | |  type=   | +-----+------+
        |workspace)| |  crux,   |       |
        +----+-----+ |  kind=   |       |
             |       | snapshot)|       |
             |       +----------+       |
             |                          |
             | resource_id              | source_id -> workspace
             v                          | target_id -> snapshot
        +----------+                    |
        |artifacts |<-------------------+
        |(files)   |     (snapshots also
        +----------+      have artifacts)

        +----------+
        |  store   |--- crux_id --> cruxes
        | (kv data)|
        +----------+
```

---

## Convention reference

| Convention | Example | Notes |
|------------|---------|-------|
| IDs | `550e8400-e29b-41d4-a716-446655440000` | UUID v4 via `crypto.randomUUID()` |
| Timestamps | `2026-03-08T14:30:00.000Z` | ISO 8601, always UTC |
| Slugs | `my-cool-project` | Generated from title, kebab-case, unique |
| Column naming | `author_id`, `resource_type` | snake_case in SQL |
| Property naming | `authorId`, `resourceType` | camelCase in TypeScript |
| Meta fields | `meta TEXT DEFAULT '{}'` | JSON string, parsed on read via `fromRow()` |
| File paths | `src/index.html` | Forward slashes, relative to workspace root |
| Fingerprints | `e3b0c44298fc1c149afb...` | SHA-256 hex, 64 characters |
| Settings keys | `cruxgarden:apiKey:anthropic` | All prefixed with `cruxgarden:` |

---

## Implementation reference

| File | Purpose |
|------|---------|
| `app/src/services/garden-io.ts` | Export/import logic: `exportGarden()`, `importGarden()` |
| `app/src/services/garden-io.test.ts` | 14 integration tests (real SQLite, no mocks) |
| `app/src/components/settings/DataSettings.tsx` | Settings page export/import UI |
| `app/src/pages/Garden.tsx` | Garden page `.garden` file detection and import handler |
| `app/src/services/sqlite/schema.sql` | Table definitions and indexes |
| `app/src/services/sqlite/client.ts` | Worker-based async SQLite bridge (`export()`, `import()`) |
| `app/src/services/sqlite/worker.ts` | Web Worker with wa-sqlite WASM engine |
| `app/src/services/sqlite/helpers.ts` | Slug generation, MIME detection, hashing, SQL builders |
| `app/src/services/sqlite/identity.ts` | Local author/home ID management |
| `app/src/services/index.ts` | Service factory and initialization |
| `app/src/services/settings.ts` | Settings persistence with key migration |

---

## Version history

| Version | Changes |
|---------|---------|
| 1.0 | ZIP-based format with `manifest.json`, `garden.sqlite`, content-addressable `artifacts/` directory, SHA-256 integrity fingerprint, legacy raw SQLite fallback |
| (legacy) | Raw SQLite database file with `.garden` extension. No manifest, no integrity check, no separate artifact blobs. Backward-compatible import only. |
