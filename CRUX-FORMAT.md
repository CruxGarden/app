# The .crux Export Format

Version 3.0 — Last updated 2026-03-08

## Overview

A `.crux` file is a ZIP archive (standard deflate compression) that contains a complete, portable snapshot of a Crux Garden workspace. It captures everything needed to fully reconstruct a crux on any device: the workspace metadata, the conversation history, every file artifact, and the complete version history with all prior snapshots.

The file extension is `.crux`, but it is a standard ZIP file and can be opened with any ZIP tool.

## Why it exists

Crux Garden is local-first. Your data lives on your device in an IndexedDB/SQLite database. The `.crux` format exists so you can:

- **Back up** a workspace to a single portable file
- **Transfer** a workspace between devices or browsers
- **Share** a creation with someone else
- **Archive** your work outside the app

## File structure

```
my-crux-202603081430.crux
├── manifest.json              # Format version, metadata, integrity
├── crux.json                  # Workspace identity and settings
├── messages.json              # Full AI conversation history
├── versions/
│   ├── current.json           # Current workspace state (artifact manifest)
│   ├── 0.json                 # First snapshot
│   ├── 1.json                 # Second snapshot
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
  "version": "3.0",
  "fingerprint": "sha256-hex-string",
  "exportedAt": "2026-03-08T14:30:00.000Z",
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
| `fingerprint` | `string` | SHA-256 archive-level integrity hash. Computed from the artifact snapshot fingerprint, crux.json content, and messages.json content. Detects tampering with any part of the archive — metadata, conversation history, or file contents. |
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
    "settings": { "palette": { ... } }
  },
  "created": "2026-03-01T10:00:00.000Z",
  "updated": "2026-03-08T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID v4. Used to detect conflicts on import (does this crux already exist locally?). In `restore` and `replace` modes, the imported crux reuses this ID. In `clone` mode, a new ID is generated. |
| `slug` | `string` | URL-safe identifier for published URLs (`crux.garden/@user/slug`). Preserved in restore/replace, regenerated in clone. |
| `title` | `string` | Human-readable workspace name. |
| `description` | `string` | Optional description. |
| `type` | `string` | Always `"workspace"` for the main crux. Snapshots have type `"crux"`. |
| `kind` | `string \| null` | Controls publish behavior: `"webapp"`, `"page"`, `"document"`, `"image"`, or `null` (auto-detect from files). |
| `status` | `string` | Lifecycle status. Typically `"living"`. |
| `visibility` | `string` | `"private"` or `"public"`. |
| `authorId` | `string \| null` | UUID of the author who owns this crux. |
| `homeId` | `string \| null` | UUID of the home (workspace container) this crux belongs to. |
| `meta` | `object` | Extensible metadata bag. Contains `summary`, `growthCount`, and any other app-specific settings (palette, etc.). On import, `messages` and `growthCount` are injected into meta by the importer. |
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

### messages.json

The full AI conversation history, stored as a JSON array.

```json
[
  { "role": "user", "content": "Make me a landing page", "timestamp": "2026-03-08T14:00:00.000Z" },
  { "role": "assistant", "content": "I'll create a landing page for you...", "timestamp": "2026-03-08T14:00:05.000Z", "model": "claude-sonnet-4-6" },
  { "role": "user", "content": [
    { "type": "text", "text": "Add a hero section" }
  ], "timestamp": "2026-03-08T14:01:00.000Z" },
  { "role": "assistant", "content": [
    { "type": "text", "text": "Here's the updated page:" },
    { "type": "tool_use", "id": "call_123", "name": "write_file", "input": { "path": "index.html", "content": "..." } },
    { "type": "tool_result", "tool_use_id": "call_123", "content": "File written successfully" }
  ], "timestamp": "2026-03-08T14:01:10.000Z", "model": "claude-sonnet-4-6" }
]
```

Each message has:
- `role`: `"user"` or `"assistant"`
- `content`: Either a plain `string` or an array of content blocks (text, tool_use, tool_result)
- `timestamp` (optional): ISO 8601 timestamp of when the message was sent. Present on all messages created by the current app version.
- `model` (optional): The AI model used for assistant messages (e.g. `"claude-sonnet-4-6"`).
- `toolCalls` (optional): Array of tool call objects for assistant messages that invoked tools.

This file is **optional**. If missing, the importer treats it as an empty array `[]`. The messages are stored in the imported crux's `meta.messages` field.

---

### versions/ directory

Contains one JSON file per version of the workspace. Every `.crux` file has at least `versions/current.json`. Snapshot versions are numbered starting from `0`.

#### versions/current.json

The current (live) workspace state.

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
    },
    "images/logo.png": {
      "fingerprint": "9f86d081884c7d659a2f...",
      "mimeType": "image/png",
      "size": 15360
    }
  }
}
```

#### versions/0.json, versions/1.json, ...

Snapshot versions. Same structure as `current.json`, but with a numeric `index` and `kind: "snapshot"`.

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
      "createdAt": "2026-03-05T10:00:00.000Z"
    }
  },
  "artifacts": {
    "index.html": {
      "fingerprint": "e3b0c44298fc1c149afb...",
      "mimeType": "text/html",
      "size": 1024
    }
  }
}
```

**Version manifest fields:**

| Field | Type | Description |
|-------|------|-------------|
| `index` | `"current" \| number` | `"current"` for the live workspace, `0`-indexed integers for snapshots. |
| `crux` | `object` | Minimal crux identity: `id`, `slug`, `title`, `kind`, `meta`. |
| `crux.meta.fingerprint` | `string` | SHA-256 of this version's artifact state. |
| `artifacts` | `object` | Map of `path → { fingerprint, mimeType, size }`. The path is the file's virtual path in the workspace (e.g. `"src/index.html"`). The fingerprint points to a blob in the `artifacts/` directory. |

**Key insight:** The `artifacts` map contains **references** (fingerprints), not file contents. The actual bytes live in `artifacts/{fingerprint}`. Multiple versions can reference the same fingerprint — this is how deduplication works.

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

1. **Parse ZIP** — Convert input to ArrayBuffer (for Node.js compatibility), load with JSZip.
2. **Validate manifest** — Require `manifest.json`, check major version is `3`.
3. **Read crux.json** — Extract workspace metadata. Require this file.
4. **Read messages.json** — Extract conversation history. Optional (defaults to `[]`).
5. **Parse version manifests** — Read all JSON files in `versions/`, separate into `current` and numbered snapshots, sort snapshots by index.
6. **Collect fingerprints** — Scan all version manifests to build a set of unique artifact fingerprints needed.
7. **Safety backup** (replace mode only) — Export the existing crux to a temporary ZIP blob in memory.
8. **Delete existing** (replace mode only) — Delete the existing crux and all related data.
9. **Create workspace crux** — Insert the new crux record with metadata, messages embedded in meta.
10. **Load artifact blobs** — Read each unique fingerprint from `artifacts/{fp}` in the ZIP into memory.
11. **Upload workspace artifacts** — For each file in `versions/current.json`, look up its blob by fingerprint and upload it as an attachment.
12. **Restore snapshots** — For each numbered version:
    - Create a snapshot crux
    - Upload its artifacts (looking up blobs by fingerprint — shared blobs are reused from memory)
    - Create a growth dimension linking the workspace to the snapshot (with weight for ordering)
13. **Final meta update** — Update the workspace crux's meta with the accurate `growthCount` (number of successfully restored snapshots).
14. **Return result** — Crux ID, title, growth count, list of any failed artifacts, and optional layout/theme data for the UI to restore.

**On failure at any step after 9:**
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
- `my-cool-project-202603081430.crux`
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
| Missing `messages.json` | Treated as empty conversation |
| Missing `versions/` directory | No snapshots restored |
| Individual artifact fails to download/read from ZIP | Skipped, added to `failedArtifacts` list |
| Individual artifact fails to upload during import | Skipped, added to `failedArtifacts` list |
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
| `app/src/services/export-import.test.ts` | 21 integration tests (real SQLite, no mocks) |
| `app/src/components/workspace/ExportPane.tsx` | Export UI (button, progress, archive preview) |
| `app/src/pages/Garden.tsx` | Import UI (file picker, conflict modal, progress) |

---

## Version history

| Version | Changes |
|---------|---------|
| 3.0 | Content-addressable artifacts, version manifests, manifest.json validation, rollback with safety backup, `kind` preservation, archive-level integrity fingerprint, `snapshotCount` (renamed from `versionCount`) |
| 2.0 | ZIP-based format with inline artifacts (no deduplication) |
| 1.x | Legacy format (backward-compatible import only) |
