# The .crux Export Format

Version 3.1 — Last updated 2026-03-10

## Overview

A `.crux` file is a ZIP archive (standard deflate compression) that contains a complete, portable snapshot of a Crux Garden workspace. It captures everything needed to fully reconstruct a crux on any device: the workspace metadata, the conversation history segmented by version, the dimension graph with metadata, every file artifact, and the complete version history with all prior snapshots.

The file extension is `.crux`, but it is a standard ZIP file and can be opened with any ZIP tool.

## Why it exists

Crux Garden is local-first. Your data lives on your device in a SQLite database (OPFS). The `.crux` format exists so you can:

- **Back up** a workspace to a single portable file
- **Transfer** a workspace between devices or browsers
- **Share** a creation with someone else
- **Archive** your work outside the app

## File structure

```
my-crux-202603101430.crux
├── manifest.json              # Format version, metadata, integrity
├── crux.json                  # Workspace identity and settings
├── dimensions.json            # Dimension graph with metadata
├── store.json                 # Crux Store entries (key-value data)
├── versions/
│   ├── current.json           # Current workspace state + message segment
│   ├── 0.json                 # First snapshot + message segment
│   ├── 1.json                 # Second snapshot + message segment
│   └── ...                    # One file per snapshot, 0-indexed
└── artifacts/
    ├── a1b2c3d4e5f6...        # File blob, named by SHA-256 fingerprint
    ├── f6e5d4c3b2a1...        # Another file blob
    └── ...                    # One entry per unique file content
```

Every file in the archive is JSON (pretty-printed with 2-space indent) except for the binary blobs in `artifacts/`.

---

## File-by-file specification

### manifest.json

The entry point. Validators should read this first.

```json
{
  "version": "3.1",
  "fingerprint": "sha256-hex-string",
  "exportedAt": "2026-03-10T14:30:00.000Z",
  "artifactCount": 12,
  "snapshotCount": 3,
  "author": {
    "username": "daniel",
    "displayName": "Daniel"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Semver-style format version. The importer checks the **major** version only — `"3.0"`, `"3.1"`, `"3.99"` are all accepted by a v3 importer. A major version mismatch (e.g. `"4.0"`) is rejected. |
| `fingerprint` | `string` | SHA-256 archive-level integrity hash. Computed from the artifact snapshot fingerprint, crux.json content, and dimensions.json content. Detects tampering with any part of the archive. |
| `exportedAt` | `string` | ISO 8601 timestamp of when the export was created. |
| `artifactCount` | `number` | Count of unique artifact blobs in the `artifacts/` directory. This is the deduplicated count, not the total number of file references across all versions. |
| `snapshotCount` | `number` | Count of snapshots that were **successfully** exported. May be less than the number of growth dimensions if some snapshots failed to export. |
| `author` | `object \| null` | The author who exported the file. Contains `username` and `displayName`. Null if exported without being logged in. |

**Validation rules:**
- `manifest.json` is **required**. A ZIP without it is rejected.
- The `version` field is required. The importer splits on `.` and compares the first segment to `"3"`.

---

### crux.json

The workspace's identity — who it is, not what it contains.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "my-cool-project",
  "title": "My Cool Project",
  "description": "A web app that does cool things",
  "type": "workspace",
  "kind": "webapp",
  "status": "living",
  "visibility": "private",
  "authorId": "author-uuid-here",
  "homeId": null,
  "meta": {
    "summary": { "title": "...", "description": "..." },
    "growthCount": 3,
    "settings": { "palette": { "..." : "..." } }
  },
  "created": "2026-03-01T10:00:00.000Z",
  "updated": "2026-03-10T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID v4. Used to detect conflicts on import (does this crux already exist locally?). In `restore` and `replace` modes, the imported crux reuses this ID. In `clone` mode, a new ID is generated. |
| `slug` | `string` | URL-safe identifier for published URLs (`crux.garden/@user/slug`). Preserved in restore/replace, regenerated in clone. |
| `title` | `string` | Human-readable workspace name. |
| `description` | `string` | Optional description. |
| `type` | `string` | Always `"workspace"` for the main crux. Snapshots have type `"crux"`. |
| `kind` | `string \| null` | Controls publish behavior: `"webapp"`, `"page"`, `"document"`, `"image"`, `"notes"`, or `null` (auto-detect from files). Snapshots use `"snapshot"`. |
| `status` | `string` | Lifecycle status. Typically `"living"`. |
| `visibility` | `string` | `"private"` or `"public"`. |
| `authorId` | `string \| null` | UUID of the author who owns this crux. |
| `homeId` | `string \| null` | UUID of the home (workspace container) this crux belongs to. |
| `meta` | `object` | Extensible metadata bag. Contains `summary`, `growthCount`, and app-specific settings. Does **not** contain `messages` — those live in version manifests. |
| `created` | `string` | ISO 8601 creation timestamp. |
| `updated` | `string` | ISO 8601 last-modified timestamp. |

**Optional UI fields** (stored in crux.json if present, passed through on import):

| Field | Type | Description |
|-------|------|-------------|
| `layout` | `object` | Workspace layout state: `paneOrder`, `paneVisibility`, `editorTabs`, `folderState`. The importer returns these so the UI can restore them to local settings storage. |
| `theme` | `object` | User's theme preferences: `mode` (light/dark) and `tint` (accent color). |

**Validation rules:**
- `crux.json` is **required**. A ZIP without it is rejected.
- If `title` is missing or empty, the importer defaults to `"Imported Crux"`.

---

### dimensions.json

The dimension graph — relationships between the workspace and its snapshots, with full metadata.

```json
[
  {
    "sourceIndex": "current",
    "targetIndex": 0,
    "type": "growth",
    "weight": 1,
    "meta": {
      "summary": "Created initial landing page with hero section",
      "artifactCount": 3,
      "preview": { "type": "html", "path": "index.html", "mimeType": "text/html" },
      "thumbnailPath": "preview.jpg"
    }
  },
  {
    "sourceIndex": "current",
    "targetIndex": 1,
    "type": "growth",
    "weight": 2,
    "meta": {
      "summary": "Restyled header and added dark mode toggle",
      "artifactCount": 4,
      "thumbnailPath": "preview.jpg"
    }
  }
]
```

Each entry represents a dimension (relationship) between two version manifests:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `sourceIndex` | `"current" \| number` | Index of the source version manifest. Currently always `"current"` (the workspace). |
| `targetIndex` | `number` | Index of the target version manifest (maps to `versions/{N}.json`). |
| `type` | `string` | Dimension type: `"growth"`, `"garden"`, `"graft"`. Currently only `"growth"` is used. |
| `weight` | `number` | Ordering weight (1-indexed). Determines timeline order. |
| `meta` | `object` | Dimension metadata — varies by type. |

**Growth dimension meta fields:**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `summary` | `string` | AI-generated snapshot summary (what changed since the previous snapshot). |
| `artifactCount` | `number` | Number of files at this point in time. |
| `preview` | `object` | Primary artifact preview info: `{ type, path, mimeType }`. |
| `thumbnailPath` | `string` | Path to the thumbnail artifact within this snapshot (e.g. `"preview.jpg"`). The importer resolves this to an attachment ID after uploading. |

**Why index-based, not UUID-based:** In clone mode, all UUIDs are regenerated. Indices are stable within the archive and map directly to version manifest filenames.

**Why `thumbnailPath` instead of `thumbnailId`:** Attachment IDs are transient — they change on every import. The path is portable and can be resolved to the new attachment ID after the snapshot's artifacts are uploaded.

---

### store.json

Per-crux key-value store entries. Optional — only present if the crux has store data.

```json
[
  {
    "key": "views",
    "value": 42,
    "mode": "public",
    "updated": "2026-03-20T10:00:00.000Z"
  },
  {
    "key": "user-prefs",
    "value": { "theme": "dark", "lang": "en" },
    "mode": "protected",
    "updated": "2026-03-20T10:05:00.000Z"
  }
]
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `key` | `string` | The store key name. |
| `value` | `any` | JSON-serializable value (string, number, boolean, object, array). |
| `mode` | `string` | `"public"` (one shared value) or `"protected"` (per-visitor). |
| `updated` | `string` | ISO 8601 timestamp of last modification. |

On import, store entries are inserted into the local SQLite `store` table. The `crux_id` is set to the imported crux's ID.

---

### versions/ directory

Contains one JSON file per version of the workspace. Every `.crux` file has at least `versions/current.json`. Snapshot versions are numbered starting from `0`.

#### versions/current.json

The current (live) workspace state, including its message segment.

```json
{
  "index": "current",
  "crux": {
    "id": "550e8400-...",
    "slug": "my-cool-project",
    "title": "My Cool Project",
    "kind": "workspace",
    "meta": {
      "fingerprint": "abc123..."
    }
  },
  "artifacts": {
    "index.html": {
      "fingerprint": "e3b0c44298fc1c149afb...",
      "mimeType": "text/html",
      "size": 2048
    },
    "style.css": {
      "fingerprint": "d7a8fbb307d7809469ca...",
      "mimeType": "text/css",
      "size": 512
    }
  },
  "messages": [
    { "role": "user", "content": "Change the header color to blue" },
    { "role": "assistant", "content": "Done! I've updated the header..." }
  ],
  "parentIndex": null
}
```

#### versions/0.json, versions/1.json, ...

Snapshot versions. Same structure as `current.json`, but with a numeric `index`, `kind: "snapshot"`, and the conversation segment that belongs to this snapshot.

```json
{
  "index": 0,
  "crux": {
    "id": "snapshot-uuid-here",
    "slug": "snapshot-1",
    "title": "Snapshot 1",
    "kind": "snapshot",
    "meta": {
      "fingerprint": "def456...",
      "parentCruxId": null
    }
  },
  "artifacts": {
    "index.html": {
      "fingerprint": "e3b0c44298fc1c149afb...",
      "mimeType": "text/html",
      "size": 1024
    }
  },
  "messages": [
    { "role": "user", "content": "Make me a landing page" },
    { "role": "assistant", "content": "I'll create a landing page..." }
  ],
  "parentIndex": null
}
```

**Version manifest fields:**

| Field | Type | Description |
|-------|------|-------------|
| `index` | `"current" \| number` | `"current"` for the live workspace, `0`-indexed integers for snapshots. |
| `crux` | `object` | Minimal crux identity: `id`, `slug`, `title`, `kind`, `meta`. |
| `crux.meta.fingerprint` | `string` | SHA-256 of this version's artifact state. |
| `artifacts` | `object` | Map of `path → { fingerprint, mimeType, size }`. The path is the file's virtual path in the workspace (e.g. `"src/index.html"`). The fingerprint points to a blob in the `artifacts/` directory. |
| `messages` | `array` | The conversation messages that belong to this version segment. Each snapshot stores only its own messages — the full conversation is reconstructed by walking the snapshot chain and concatenating segments. |
| `parentIndex` | `number \| null` | Index of the parent snapshot in the version history. `null` for the first snapshot. Enables branching — when the history is a DAG rather than a linear chain. |

**Key insight: message segmentation.** Each version manifest stores only the messages from its own conversation segment. The full conversation is reconstructed by walking the growth chain (snapshot 0 → snapshot 1 → ... → current) and concatenating all segments. This mirrors the local storage model where each snapshot crux stores its own `meta.messages`.

**Key insight: content-addressable artifacts.** The `artifacts` map contains **references** (fingerprints), not file contents. The actual bytes live in `artifacts/{fingerprint}`. Multiple versions can reference the same fingerprint — this is how deduplication works.

---

### artifacts/ directory

Contains the raw file blobs, named by their SHA-256 fingerprint (hex-encoded, no extension).

```
artifacts/
├── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
├── d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592
└── 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

Each file is the raw binary content of an artifact. The filename IS the SHA-256 fingerprint of that content. This is content-addressable storage:

- **Deduplication**: If the same file content appears in 5 different snapshots, it is stored once. All 5 version manifests reference the same fingerprint.
- **Integrity**: You can verify any artifact by computing `SHA-256(file_bytes)` and comparing to the filename.
- **No extensions**: The mime type and original filename are stored in the version manifests, not in the artifact filename.

---

## Content-addressable storage explained

The `.crux` format separates "what files exist in each version" from "what are the file contents." This is similar to how Git stores objects.

**Example:** A workspace has 3 snapshots, each with `index.html`. The HTML file was modified once between snapshot 1 and 2, but unchanged between 2 and 3.

```
versions/0.json  →  index.html → fingerprint: aaa111
versions/1.json  →  index.html → fingerprint: bbb222  (file changed)
versions/2.json  →  index.html → fingerprint: bbb222  (same as snapshot 2)
current.json     →  index.html → fingerprint: bbb222  (same as snapshot 2)

artifacts/
├── aaa111    ← stored once (used by snapshot 1)
└── bbb222    ← stored once (used by snapshots 2, 3, and current)
```

Only 2 blobs are stored, not 4. For workspaces with many snapshots and large files, this can dramatically reduce archive size.

**This same deduplication applies at the storage level.** Inside the app, all file content lives in OPFS (`blobs/{fingerprint}`), separate from the SQLite database which stores only metadata. Snapshot cloning is a metadata-only operation — no content is ever copied.

---

## Import modes

When importing a `.crux` file, the app first calls `peekImport()` to check if a crux with the same `id` already exists locally. If it does, the user is shown a conflict dialog with three choices:

### restore (default)

- Uses the original `id` and `slug` from the export
- Fails if a crux with the same `id` already exists (UNIQUE constraint)
- Intended for restoring from backup to a clean database

### replace

- Deletes the existing crux and all its data (artifacts, snapshots, dimensions)
- Creates the new crux with the original `id` and `slug`
- **Safety mechanism**: Before deleting, the app creates a temporary backup export of the existing crux. If the import fails at any point after the delete, the original is automatically restored from this backup. No data loss.

### clone

- Generates a fresh UUID for the crux
- Generates a new slug (title-slugified + timestamp suffix)
- Generates new IDs and slugs for all snapshot cruxes
- Both the original and the clone exist side by side
- Useful for "I want a copy of this but keep the original"

---

## Import process (step by step)

1. **Parse ZIP** — Convert input to ArrayBuffer, load with JSZip.
2. **Validate manifest** — Require `manifest.json`, check major version is `3`.
3. **Read crux.json** — Extract workspace metadata.
4. **Read dimensions.json** — Extract dimension graph with metadata.
5. **Parse version manifests** — Read all JSON files in `versions/`, separate into `current` and numbered snapshots, sort snapshots by index.
6. **Collect fingerprints** — Scan all version manifests to build a set of unique artifact fingerprints needed.
7. **Safety backup** (replace mode only) — Export the existing crux to a temporary ZIP blob in memory.
8. **Delete existing** (replace mode only) — Delete the existing crux and all related data.
9. **Write artifact blobs** — For each unique fingerprint, read from the ZIP's `artifacts/` directory and write to OPFS blob storage.
10. **Create workspace crux** — Insert the new crux record. Messages come from `versions/current.json`, not a flat file.
11. **Upload workspace artifacts** — For each file in `versions/current.json`, create metadata rows pointing to the OPFS blobs.
12. **Restore snapshots** — For each numbered version:
    - Create a snapshot crux with messages from its version manifest
    - Resolve `parentIndex` to `parentCruxId` using the index→ID map built during import
    - Upload its artifacts (metadata rows referencing the same OPFS blobs)
    - Create a growth dimension with full metadata from `dimensions.json`
    - Resolve `thumbnailPath` back to `thumbnailId` using the newly uploaded artifact's ID
13. **Final meta update** — Update the workspace crux's meta with the accurate `growthCount`.
14. **Return result** — Crux ID, title, growth count, list of any failed artifacts, and optional layout/theme data.

**On failure at any step after 10:**
- All cruxes created during the import are deleted (cascade deletes their artifacts and dimensions)
- In replace mode, the original crux is restored from the safety backup
- The original error is re-thrown to the caller

---

## Filename convention

Export files are named:

```
{slug}-{YYYYMMDDHHmm}.crux
```

Examples:
- `my-cool-project-202603101430.crux`
- `landing-page-202603010900.crux`

If the crux has no slug, `crux` is used as the prefix.

---

## Conflict detection (peekImport)

Before importing, the app calls `peekImport()` which:

1. Reads `crux.json` from the ZIP (without importing anything)
2. Checks if a crux with the same `id` exists in the local database
3. If it does, returns conflict information:

```typescript
{
  title: "My Cool Project",
  installedVersion: 5,        // growthCount of existing local crux
  installedUpdated: "2026-03-07T...",  // when the local crux was last modified
  incomingVersion: 3,         // growthCount from the import file
  incomingUpdated: "2026-03-05T...",   // when the imported crux was last modified
}
```

This lets the UI show the user whether the import is newer or older than what they have installed, so they can make an informed replace/clone/cancel decision.

---

## Error handling summary

| Scenario | Behavior |
|----------|----------|
| Missing `manifest.json` | Import rejected with error |
| Unsupported format version | Import rejected with error |
| Missing `crux.json` | Import rejected with error |
| Missing `dimensions.json` | Bare dimensions created from sequential ordering |
| Missing `versions/` directory | No snapshots restored |
| Individual artifact blob fails to read/write | Skipped, added to `failedArtifacts` list |
| Individual snapshot fails to export | Skipped, added to `failed` list, `snapshotCount` reflects actual |
| Individual snapshot fails to import | Skipped, `growthCount` reflects actual |
| Workspace create fails | Rollback (delete any created cruxes), restore backup if replace mode |
| Final meta update fails | Rollback + restore backup |
| Backup export fails (replace mode) | Import proceeds without safety net |
| Backup restore fails (during rollback) | Error logged, original error still thrown |

---

## Implementation reference

| File | Purpose |
|------|---------|
| `app/src/services/crux-io.ts` | All export/import logic: `exportCrux()`, `importCrux()`, `peekImport()` |
| `app/src/services/export-import.test.ts` | 26 integration tests (real SQLite, no mocks) |
| `app/src/components/workspace/ExportPane.tsx` | Export UI (button, progress, archive preview) |
| `app/src/pages/Garden.tsx` | Import UI (file picker, conflict modal, progress) |

---

## Version history

| Version | Changes |
|---------|---------|
| 3.1 | Message segmentation (per-version `messages` + `parentIndex`), `dimensions.json` with full metadata (summary, preview, thumbnailPath), OPFS blob storage (all content out of SQLite), archive fingerprint covers dimensions |
| 3.0 | Content-addressable artifacts, version manifests, manifest.json validation, rollback with safety backup, `kind` preservation, archive-level integrity fingerprint, `snapshotCount` |
| 2.0 | ZIP-based format with inline artifacts (no deduplication) |
| 1.x | Legacy format (backward-compatible import only) |
