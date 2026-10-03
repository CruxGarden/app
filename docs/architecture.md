# Crux Garden app architecture

This is the contributor map for the shipping desktop app. It records the current
ownership boundaries and the decisions a change must preserve. It is sufficient
with this repository and the linked [API repository](https://github.com/CruxGarden/api);
a separate parent checkout or private decision archive is not required.

## Vocabulary

| Term                | Meaning                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Crux                | A creative project with its own files, Collaboration and history.                                        |
| Garden              | A Crux that organizes other Cruxes through membership relationships.                                     |
| Artifact            | A file belonging to a Crux; the Artifacts panel presents these files.                                    |
| Project Folder      | The real directory containing a workspace's current files.                                               |
| Collaboration       | The conversation and recorded tool work belonging to that workspace.                                     |
| Growth              | The history surface, including explicitly marked versions and retained Task states.                      |
| Edit history        | Automatic retained file states; routine saves are bounded/coalesced separately from marked versions.     |
| Task / Working Copy | An independently editable workspace of a Crux, with a retained starting state and explicit review/merge. |
| Mood                | The editable appearance and experience configuration, including named Theme Tokens.                      |
| Crux Tool           | An installable creative editor/template package described by `crux-tool.json`.                           |

A workspace is a running view of an owner, not another stored Crux merely because
someone opened a panel. Main and a Task have distinct content ownership. Membership,
provenance and history relationships do not themselves grant filesystem or account
access.

## Processes and storage ownership

```text
React renderer: views, workspace stores, captured user operations
  → typed preload IPC
Electron main: trusted host, Project Folder grants, previews, watchers, secrets
  → SqliteApi adapter
Packaged @cruxgarden/local-api: named commands, validation, transactions, history
  → native SQLite metadata + SHA-256 Blob Store

External editor / agent → Project Folder → watcher → ingestion → local API
Hosted API ← explicit authentication, backup/sync, publication, included AI requests
```

The desktop consumes the real local runtime built from the API repository. It runs
inside Electron's main process, owns the SQLite connection and serializes domain
commands. It does not require PostgreSQL, Redis or a separately launched HTTP
server for local creation. Electron supplies filesystem access and native SQLite;
the renderer cannot mutate SQLite with arbitrary SQL.

| Boundary                                       | Source                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Renderer startup and routes                    | [main.tsx](../src/main.tsx), [App.tsx](../src/App.tsx), [appStore.ts](../src/stores/appStore.ts)                                   |
| Service initialization                         | [services/index.ts](../src/services/index.ts)                                                                                      |
| Shared IPC contract and preload                | [bridge.ts](../electron/src/bridge.ts), [preload.ts](../electron/src/preload.ts)                                                   |
| Trusted IPC handlers and host lifecycle        | [main.ts](../electron/src/main.ts)                                                                                                 |
| Runtime adapter and renderer read/command port | [sqlite-api.ts](../electron/src/sqlite-api.ts), [electron-client.ts](../src/services/sqlite/electron-client.ts)                    |
| Folder admission, file operations and scanning | [projects.ts](../electron/src/projects.ts), [watcher.ts](../electron/src/watcher.ts), [ingestion.ts](../src/services/ingestion.ts) |
| Runtime implementation and packaging           | [API local runtime](https://github.com/CruxGarden/api#local-runtime)                                                               |

Project Folder grants name exact admitted directories. The allocation parent is
not a grant to arbitrary sibling folders. IPC checks the requesting frame/origin;
previewed and downloaded content must not receive the app's privileged bridge.
Credentials live in the appropriate authentication/secret boundary, outside
portable working content.

Browser authoring is retired as a product direction. The SQLite-WASM worker,
optional command members and some SQL.js fixtures still exist during incremental
retirement; their presence is not an alternative supported desktop storage owner.
Do not add new fallback writers. The public build (`VITE_PUBLIC_SITE=1`) retains
landing, Explore, docs, public Gardens and published-Crux views. Those public
surfaces are distinct from desktop authoring.

## Current files, history and recovery

[ManifestArtifactService](../src/services/manifest-artifact.service.ts) translates
renderer file operations into native commands. A selected file reference carries
its content owner, selected head and path. Reads and writes must preserve that
selection across asynchronous work; an ID alone is not permission to use whatever
file is current later.

App writes, deletes and renames validate the captured source/target selection and
actual disk state. The API records the new content head and a durable path-scoped
projection intent together; Electron completes the admitted filesystem operation.
A host failure after that commit is a **pending file update**, distinct from a
refused command. [File recovery](../src/services/file-content.ts) finishes the
existing intent on explicit retry or reopen, then reconciles the captured owner's
folder. Retry does not replay an old mutation or obtain new replacement consent.

The host stages originals in `.crux-recovery` inside the admitted Project Folder.
These private paths are excluded from normal scans, captures and previews. Unknown
or conflicting bytes are retained for recovery; there is no automatic deletion of
that safety area. Completed receipts make replay leave later external edits alone.
These guards are not an OS-wide lock against arbitrary external writers.

External filesystem changes follow watcher → fingerprint → ingestion. Ingestion
updates the native index without writing those bytes back to disk. Internal
metadata such as the workspace thumbnail is not an editable Project Folder file.
The Blob Store retains immutable fingerprinted bytes; SQLite points to immutable
manifest roots rather than copying every file for each saved state.

Routine saves use bounded automatic edit history. Explicit destructive upload
replacement, rename and delete retain a safety state. Marked Growth versions,
Task starting states and completed merge references have their own retention
rules. [Growth](../src/services/growth.ts), [edit history](../src/services/edit-history.ts)
and the native API own these distinctions; do not manufacture marked versions to
make an older test fixture pass.

## Workspace lifetime and Tasks

[workspaceRegistry.ts](../src/stores/workspaceRegistry.ts) owns running workspace
sessions. Each session has its own Crux data store, UI store, operation set and
cleanup lifecycle. [workspaceSelection.ts](../src/stores/workspaceSelection.ts)
tracks visibility and operations; changing the visible workspace must not redirect
a pending save, upload, publication or approval.

[workspace-documents.ts](../src/services/workspace-documents.ts) owns open drafts
and their save/drain behavior. [turns.ts](../src/services/turns.ts) owns AI jobs and
cancellation. Closing waits for owned work and requires a save/discard decision
for dirty documents. A failed drain must leave the workspace recoverable.

[Tasks](../src/services/tasks.ts) use the required [Task command boundary](../src/services/task-storage.ts)
for creation, retained bases, review, merge and recovery. Main is unchanged until
an admitted review is applied. Interrupted setup and merge keep their recovery
state across restart. [Delegation](../src/services/delegate-working-copies.ts)
uses these same Tasks; it is not a second snapshot or merge implementation.
Workspace draining and Task coordination still share responsibilities. Preserve
existing close/cancellation/restart tests when changing that boundary.

## Publication, previews and AI

Ordinary desktop previews serve Project Folder files through the host's static
preview server. Site Cruxes use their development server; a publish build produces
the public output. Preview lifecycle is owner-scoped and separate from a panel's
mount/unmount lifecycle. See [site.ts](../src/services/site.ts) and
[preview-owners.ts](../src/services/preview-owners.ts).

[Publication](../src/services/publish.ts) settles the captured workspace's drafts,
selects and reads immutable files, and prepares any supported public-edition build
before remote mutation. It carries the captured account/API context through
publication and Function secret synchronization. A public edition is distinct
from a complete private backup; tool-private files and private Collaboration do
not become public merely because they exist locally. Function code and its policy
are captured as a publication revision.

[publication-plan.ts](../src/services/publication-plan.ts) gives sharing controls,
file collection and change detection the same output decision. A Tool may declare
`publication: { type: "static", root: "public/", include: ["data/project.json"] }`
with `share: true`. Files below `root` lose that prefix in the public edition;
explicitly included files and directories keep their paths. The root's
`index.html` and every exact file include must exist. Directory includes end in
`/` and may be empty. All selected bytes become public, including a whole document
when it is included; keep private material outside that scope.

The [manifest validator](../src/services/crux-tools/manifest.ts) and publication
plan refuse unsafe/private system paths, root-folder sharing, wildcards, commands,
missing entry files and duplicate output paths. A malformed saved declaration
refuses publication instead of falling back to every file. Visitor code must run
without the Garden parent bridge. Existing trusted build exporters remain
supported; downloaded packages cannot supply executable host-side build hooks.

[Sync backup](../src/services/backup.ts), [pull](../src/services/sync-pull.ts) and
[installation recovery](../src/services/garden-io.ts) use explicit captured
account/source/destination identities. Account changes during an operation must
refuse or finish under the original authorized context, never silently retarget.
Hosted services own account authentication, remote storage and public serving;
a successful desktop build does not deploy those services.

BYOK AI calls go to the selected provider; local models use their local endpoint.
Configured included collaboration uses the hosted API's metered provider path.
Tools execute through the workspace's services/Project Folder permissions. Agent
Host connections use explicit access and the same operation/approval boundaries.

## Archives and Crux Tools

| Operation                             | Contract and owner                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private `.crux` backup/copy           | Native archive3 graph admission and complete retained content; [CRUX-FORMAT.md](../CRUX-FORMAT.md).                                                                                                                   |
| Whole-installation `.garden` recovery | Format4 with explicit installation scope, inspected database image and verified content; [GARDEN-FORMAT.md](../GARDEN-FORMAT.md).                                                                                     |
| Selected Garden package               | [cruxspace-package.ts](../src/services/cruxspace-package.ts) wraps native member archives, membership, provenance and Garden Collaboration. Wrapper admission remains sequential; do not claim it is one transaction. |
| Plain file ZIP                        | Artifact export, not a complete history/identity backup.                                                                                                                                                              |
| `.cruxtool`                           | Validated package manifest and complete editor/seed assets; [package.ts](../src/services/crux-tools/package.ts).                                                                                                      |

Restore retains identity subject to conflict admission; copy remaps included
identities and records provenance. Matching an ID is not authorization to replace
local work. Verify required bytes before committing incoming graph state, and
preserve existing user data on refusal. Device paths, credentials and running
resources are not portable project metadata.

[Crux Tool manifests](../src/services/crux-tools/manifest.ts) and the
[registry](../src/services/crux-tools/registry.ts) drive discovery and editor
identity. Projects retain a manifest snapshot. Downloaded packages run their
editor through the bounded document bridge; downloaded host modules are never
executed. Sharing a Tool template distributes the package. Sharing a creation
uses its supported publication declaration or an existing trusted exporter;
`share: true` alone does not provide an unfamiliar editor with a public edition.
The [Tool starter guide](../src/templates/tool-starter/README.md) documents the
editor bridge and a complete static-publication example.

[Task and review creation](../src/services/tasks.ts) retain the source's saved
Tool manifest and content model in their own native metadata. Later parent edits,
installation updates or removal do not replace that editor/publication contract;
setup recovery uses the retained contract after restart. Tasks remain editable
through their own owner-bound document bridge. Public publication still requires
merging into Main and publishing from Main.

Stack and Runner declare `publication: { type: "garden-package" }`.
[WorkspacePackageShare](../src/components/workspace/WorkspacePackageShare.tsx)
offers a local editable `.cruxspace` handoff, not online workspace publication.
The person explicitly chooses a containing Garden, reviews its named members and
confirms disclosure of member files, Collaboration, Tasks and Growth, plus Garden
Collaboration and schedules. Export rechecks the approved membership and refuses
an incomplete package. Saved secrets and local folder grants are excluded;
recipients choose their own folders and configure secrets. The separate
single-Crux export includes only that Crux's private archive, without its related
Garden members.

## Appearance and public decision summary

Moods own appearance. Components own structure and behavior; named Theme Tokens
own colors, type hierarchy, borders, corners, shadows and motion. Reuse semantic
tokens and expose new customization through the Mood Builder/package round trip.
Do not add hidden alpha/opacity multipliers to a person's chosen token.

These accepted boundaries are summarized publicly here so contributors do not
need the workspace's parent decision archive:

- **Folder authority and native host:** current workspace files are real files;
  Electron supplies the desktop host and bounded filesystem access.
- **One local API owner:** named commands own native persistence; stores project
  state. Browser authoring retirement is accepted, with remaining code removal
  tracked as incomplete work.
- **Immutable history and explicit transfer:** preserve selected heads, retained
  bytes and identity/conflict semantics. Published output, private backup and
  installation recovery have different scopes.
- **Captured operation ownership:** navigation, account changes and retries do
  not redirect an admitted operation or replay stale replacement consent.
- **Bounded extensions:** downloaded editor content does not install executable
  privileged host code. Capabilities must describe implemented behavior.
- **Moods own appearance:** visual customization stays editable and portable.

A proposal that changes one of these boundaries should state the decision,
rejected alternatives, affected callers and preservation tests in the PR, and
update this guide with the implementation. The older documents under
`docs/subsystems/` contain historical browser-era walkthroughs; use the current
source map above for ownership and storage contracts.

## Verification and runtime changes

Use Node22 from `.nvmrc`. [CONTRIBUTING.md](../CONTRIBUTING.md) describes setup,
packaging, native media and platform acceptance.

```bash
# App repository
npm run verify

# Electron host
cd electron
npm run verify
npm run build:all
npm run test:e2e -- --project=gate
```

The app gate checks types, lint, runtime parity, tool integration, tests and build.
The Electron gate compiles the host and runs its unit project. Real UI acceptance
uses Playwright against the actual app; service tests do not replace that journey.
Run additional affected desktop specs when a workflow is outside the gate set.

[Native service fixtures](../src/test/local-api-fixture.ts) use the installed local
API and real SQLite/Blob Store in temporary directories. Opt into the actual
Project Folder bridge for workflows that materialize or reconcile files. Older
SQL.js tests still need migration; their passing count alone does not validate
the shipped command path. Preserve each test's expected behavior during migration.

[Launch settings](../electron/src/launch-settings.ts) interpret an absolute
`CRUX_TEST_PROFILE` as isolated `userData/` and `garden/` storage. Only development
processes with that profile receive test privileges/mocks. Packaged builds may
use the isolated storage location but ignore test privilege overrides. Never run
automation against someone's personal Garden.

For native runtime changes, build/package in the API repository, then pin the
same produced archive in both app and Electron manifests/lockfiles. Node and
Electron use different native binaries; do not share their `node_modules`.
[Runtime parity verification](../scripts/verify-local-api-test-runtime.mjs) checks
both consumers. Keep package provenance/license files and rerun API, app, host
and affected actual-desktop acceptance after installing a new runtime. Repository
gates do not establish signing, updates or live provider/deployment acceptance.
