# The .crux private archive format

Current wire contract: **archiveVersion 3, graphVersion 3, payloadVersion 1**.
Last reviewed: 2026-10-02.

A `.crux` is a complete private backup of a selected Crux and its retained work.
It is a standard ZIP container; the local API owns graph capture, validation and
import. The renderer coordinates saved work and presents conflicts. It does not
serialize database rows or reconstruct history itself.

Private archives can include Main and Task conversations, marked Growth,
retained starting/review/merge states and visitor-specific Crux Store values.
They are not the public projection used when publishing. Review private content
before giving an archive to somebody else. The container is not encrypted.

The retired formats that used `crux.json`, `versions/`, `tasks.json` and
`artifacts/` are rejected. There is no legacy converter or partial-content fallback.

## Container

```text
my-crux-1790928000000.crux
├── manifest.json
├── graph.json
└── content/
    ├── <SHA-256 fingerprint>
    └── ...
```

`manifest.json` is a strict envelope:

```json
{
  "archiveVersion": 3,
  "purpose": "private-backup",
  "graphVersion": 3,
  "payloadVersion": 1,
  "graphFingerprint": "<64 lowercase hexadecimal characters>"
}
```

`graphFingerprint` is the SHA-256 of the exact UTF-8 `graph.json` bytes, not a
hash of reformatted or independently canonicalized JSON. The envelope has no
other fields. Missing files, unsupported versions, extra entries, unsafe ZIP
paths and duplicate content inventory entries refuse intake.

Each `content/<fingerprint>` entry holds immutable bytes whose SHA-256 must match
its name. The graph lists the complete inventory in `fingerprints`. Shared bytes
travel once, even when several paths or retained states refer to them. Inventory
includes immutable file manifests and their required content, not only visible
current files. Every required entry must arrive in the archive; an existing local
cache cannot substitute for missing or corrupt incoming bytes.

## Graph

The executable schema is
[`privateGraphSchema`](../api/src/local/portable-graph.ts). It uses explicit field
allowlists, UUID identities, validated dates and typed graph/content references.
Its top-level fields are:

| Field                                       | Meaning                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `purpose`, `graphVersion`, `payloadVersion` | Independent graph and content contracts, matching the envelope.                                                   |
| `selection`                                 | Selected `roots` and the `includeMembers` traversal policy.                                                       |
| `cruxes`, `dimensions`                      | Portable Crux records and internal relationships.                                                                 |
| `workingCopies`, `taskMerges`               | Retained Task identity, starting state and review/merge context.                                                  |
| `contentHeads`                              | Each retained owner's immutable content root and revision.                                                        |
| `editHistory`                               | Optional retained Edit history with typed content references.                                                     |
| `store`                                     | Public and separate visitor-owned Store values.                                                                   |
| `boundary`                                  | Relationships outside the selection or to unavailable objects; these do not grant access or import those objects. |
| `fingerprints`                              | Complete deduplicated incoming content inventory.                                                                 |

Ordinary `.crux` export selects one Main root with `includeMembers: false`.
Its required Task/Growth/content dependencies still travel. The app's `.crux`
inspector and importer require one selected root. API graph operations can select
multiple roots or Garden membership; that does not make an arbitrary graph
selection a single-Crux app import.

The API validates more than JSON shape: retaining ownership, typed references,
ancestry, immutable content trees, required bytes and destination admission must
all be valid. A label does not manufacture Growth. Explicitly marked versions,
branching, original timestamps and retained unmarked work stay distinct.

Portable private metadata retains user content and presentation. It removes
application-owned device and execution fields: Project Folder paths, deployment
state, active turns, agent-host state and session/preview bindings. Destination
attribution and fresh native Project Folders are admitted through the API.
Opaque user metadata is not automatically scrubbed of private content.

## Export

1. Capture the selected source identity and progress callback before awaiting work.
2. Check Main ownership and finish pending Main/Task content projections.
3. Settle and save the authoritative workspaces and their Collaboration.
4. Ask the API to capture and pack the complete selected private graph.

Stale dialog message fields cannot override saved Collaboration. Missing or
corrupt retained content and failed Store reads refuse the export; they do not
produce an apparently successful partial backup. Export creates no new Growth.

Filename: `{slug-or-crux}-{Unix milliseconds}.crux`. The filename is a convenience,
not identity or integrity metadata.

## Inspection and import

`peekImport()` validates through the API without admitting records, then looks up
the root identity. Only an actual not-found result means absence; a database error
is returned to the caller. Conflict details show the incoming title, marked Growth
counts and current/incoming update timestamps.

| App mode  | API admission                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restore` | Preserve original graph identities in an available destination. Occupied identities refuse.                                                                                            |
| `clone`   | API `copy`: allocate new graph identities and remap typed internal references; preserve original work.                                                                                 |
| `replace` | Close the affected Crux workspaces and obtain the API's replacement token for the inspected destination before checked replacement. Garden membership selections require copy instead. |

The API verifies the complete incoming inventory, prepares fresh folders, checks
destination preconditions and commits graph admission atomically. A failed
admission does not leave a partial graph or replace existing records. Immutable
staged bytes or isolated prepared folders are not a successful import. Replacement
also retains its API-owned safety archive. Import does not replay renderer SQL
inserts or try to reconstruct the original graph after a failed delete.

A caller can reuse the same `requestId` for the same import retry. The API binds
that receipt to the actual request; replay returns the committed result without
overwriting later work. Reusing it for a different request refuses. Import itself
does not publish, grant access or execute downloaded host modules.

## Other containers

- A plain Artifact `.zip` contains the selected files at their paths, with progress
  and reported unreadable files. It is not a private graph backup.
- `.cruxspace` is the Garden package wrapper. It contains member private archive3
  metadata and shared content, or complete inline archive3 members in shipped
  undertakings. Its sequential member admission is not one atomic Garden graph
  transaction.
- `.garden` is a whole-installation backup with a captured SQLite database and
  verified content inventory; it is not a shareable selected graph.
- `.cruxtool` and `.cruxmood` are installable Tool and Mood packages with their own
  content contracts. An ordinary project archive does not automatically install a tool.

## Implementation and verification

- [`private-graph-archive.ts`](../api/src/local/private-graph-archive.ts): container packing/opening.
- [`portable-graph.ts`](../api/src/local/portable-graph.ts): executable schema and portable record policy.
- [`graph-transfer.service.ts`](../api/src/local/graph-transfer.service.ts): checked API admission, receipts and replacement.
- [`crux-io.ts`](src/services/crux-io.ts) and [`private-crux-archive.ts`](src/services/private-crux-archive.ts): renderer facade and workspace coordination.
- [`crux-format.test.ts`](src/services/crux-format.test.ts) and [`export-import.test.ts`](src/services/export-import.test.ts): actual native conformance, metadata and read/write failure cases.
- [`archive-facade.test.ts`](src/services/archive-facade.test.ts), [`private-archive-content.test.ts`](src/services/private-archive-content.test.ts) and [`task-import-replacement.test.ts`](src/services/task-import-replacement.test.ts): identity/replay, bytes, visitors, branches and Main/Task retention/replacement.
- [`private-archive-ui.spec.ts`](electron/e2e/private-archive-ui.spec.ts): real desktop UI across isolated profiles, restart and authenticated outside-agent export.

Run `npm run verify` in `app/` and `api/`; desktop acceptance uses
`npm run test:e2e -- e2e/private-archive-ui.spec.ts --project=desktop` in
`app/electron/`. These tests use isolated data; never test replacement against a
person's real Garden.
