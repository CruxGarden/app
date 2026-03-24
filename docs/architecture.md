# Crux Garden App — Architecture Guide

This document traces the app from its entry point through every architectural layer. It's meant to be read top-to-bottom as a walkthrough, with each subsystem covered in detail in the [subsystems/](subsystems/) directory.

---

## 1. Entry Point

### `index.html`

The root HTML document. Contains `<div id="root">` and a `<script type="module" src="/src/main.tsx">` entry. Includes an inline splash screen that reads mood palette colors from localStorage and applies them before React loads — this prevents a flash of unstyled content on app routes (`/home`, `/c/`, `/settings`). The splash is hidden by default (`display:none`) and only activated on app routes by the inline script. Gateway and public pages never see it.

### `src/main.tsx`

The React bootstrap. The `Bootstrap` component does conditional initialization based on route type:

- **App routes** (`/home`, `/c/:id`, `/settings`): calls `initServices()` to start SQLite + OPFS, then `ensureLocalAuthor()` to create an anonymous local author if needed, then `authStore.init()` for token refresh. The splash screen stays visible until services are ready.
- **Public routes** (`/:username/:slug`): calls `authStore.init({ lightweight: true })` — checks for stored tokens and refreshes them without initializing SQLite. This keeps public page load fast.
- **Gateway** (`/`): no initialization at all.

Also registers the preview service worker (`preview-sw.js`) and suppresses Monaco editor Strict Mode errors.

### `src/App.tsx`

Creates the React Router and renders `<AnimatedBackground />` behind everything. The router uses a dynamic basename from `window.__CRUX_BASENAME__` (set by the publish injection system for nested iframe rendering).

---

## 2. Architecture Overview

Crux Garden is a **local-first** application. All user data — cruxes, messages, artifacts, settings — lives in the browser's SQLite database (via OPFS). The server API is used only for: authentication, publishing to S3, and syncing. The app works offline after first load.

### Data Flow

```
Browser
├── SQLite (wa-sqlite WASM) ← all CRUD operations
│   └── OPFS blobs/ ← content-addressable file storage (SHA-256)
├── Zustand stores ← reactive UI state
├── Service layer ← abstracts SQLite vs API backends
└── API (NestJS) ← auth, publish, sync only
    └── S3 ← published static files
        └── CloudFront ← per-crux subdomain isolation
```

### Backend Selection

The service layer (`services/index.ts`) supports two backends:

- **`local`** (default) — SQLite via OPFS. All CRUD is local. Publish uses the API.
- **`api`** — HTTP to NestJS. Used when explicitly configured (rare).

Both backends implement the same interfaces (`ICruxService`, `IArtifactService`, etc.), so the rest of the app doesn't know or care which is active.

---

## 3. Build Tool (Vite)

Vite 6 with React plugin and Tailwind CSS 4.

- **Dev** (`npm run dev`): native ES module serving with HMR on port 8080
- **Prod** (`npm run build`): Rollup bundling to `dist/` with sourcemaps
- **Path alias**: `@/*` maps to `src/`
- **Env vars**: only `VITE_`-prefixed variables are exposed to the browser

Key env vars:
- `VITE_API_URL` — API base (default `http://localhost:3000`)
- `VITE_PREVIEW_ORIGIN` — cross-origin preview iframe host
- `VITE_PUBLISH_ORIGIN_TEMPLATE` — per-crux subdomain pattern (e.g., `https://{cruxId}.publish.crux.garden`)

---

## 4. Routing

React Router v7 with `createBrowserRouter`.

### Public routes (no auth)

| Path | Page | Purpose |
|------|------|---------|
| `/` | Gateway | Welcome page |
| `/explore` | Explore | Browse public cruxes |
| `/:username/:slug/*` | PublicCrux | Published crux display (nested for SPA sub-routes) |
| `/:username` | PublicGarden | Author's public garden/portfolio |

### App routes (wrapped in Shell)

| Path | Page | Purpose |
|------|------|---------|
| `/home` | HomeGarden | User's crux library |
| `/c/:id` | CruxBuilder | The workspace |
| `/settings` | Settings | Profile, API keys, data management |

### No login page

There is no `/login` route. The app is local-first — everything works without an account. When a feature needs a connected account (sharing, sync, protected store keys), an inline `ConnectAccount` form appears in context (e.g., inside the Share pane). Authentication is handled via email + code, same as before, just inline rather than a separate page.

`Shell` wraps all app routes with TopBar, CommandPalette (`Cmd+K`), KeeperConsole (`Escape`), and mood editor panel.

---

## 5. State Management (Zustand)

Six stores hold all app state. Components subscribe via selectors — only the subscribed values trigger re-renders.

### Store Overview

| Store | Purpose | Key State |
|-------|---------|-----------|
| `authStore` | Identity | account, author, tokens, isAuthenticated |
| `cruxStore` | Active workspace | crux, messages, artifacts, growths, streaming, snapshots |
| `gardenStore` | Crux library | cruxList, search, sortBy |
| `uiStore` | Layout & editor | paneOrder, paneVisibility, mosaicLayout, editor tabs, folder state |
| `themeStore` | Dark/light mode | mode, resolved |
| `moodStore` | Creative environment | activeMood, palette overrides, persona, background |

For detailed coverage of each store's state and actions, see [subsystems/stores.md](subsystems/stores.md).

### Store vs Hook Pattern

**Stores** hold data and simple mutations. **Hooks** coordinate side effects and lifecycle.

Example — sending a chat message:
1. `ChatPane` calls `useChat().send("make me a website")`
2. `useChat` adds the user message to `cruxStore`
3. `useChat` starts an SSE stream via the provider adapter
4. On each event → `useChat` updates `cruxStore` (streaming content, tool calls)
5. On stream end → `useChat` finalizes the message, sets `pendingGrowthCreation`
6. Growth creation hook watches the flag and creates a snapshot

Stores don't know about component lifecycle — they can't react to mounting/unmounting. Hooks bridge that gap with `useEffect` cleanup (e.g., aborting a stream on navigate-away).

---

## 6. Service Layer

The service layer abstracts data access behind interfaces. Six services:

| Service | Interface | SQLite impl | API impl |
|---------|-----------|-------------|----------|
| Crux | `ICruxService` | `SqliteCruxService` | `ApiCruxService` |
| Artifact | `IArtifactService` | `SqliteArtifactService` | `ApiArtifactService` |
| Dimension | `IDimensionService` | `SqliteDimensionService` | `ApiDimensionService` |
| Author | `IAuthorService` | `SqliteAuthorService` | `ApiAuthorService` |
| Publish | — | — | `ApiPublishService` (always API) |
| Store | — | `SqliteStoreService` (always local) | — |

### SQLite + OPFS

The local database runs as a WASM module (`wa-sqlite`) in a Web Worker. Communication is via `postMessage`.

- **`services/sqlite/worker.ts`** — the Web Worker. Loads WASM SQLite with AccessHandlePool VFS (OPFS-backed). Handles SQL queries, blob read/write, export/import.
- **`services/sqlite/client.ts`** — `SqliteClient` wraps the Worker with a Promise-based API. Methods: `run()`, `get()`, `all()`, `blobWrite()`, `blobRead()`, `blobDelete()`, `export()`, `import()`.

### Content-Addressable Blob Storage

All file content is stored in OPFS at `crux-blobs/{fingerprint}` where fingerprint is the SHA-256 hash of the content. SQLite stores only metadata (path, size, mime type, fingerprint). This enables:

- **Deduplication** — identical files across cruxes or snapshots share one blob
- **Instant snapshot cloning** — copying metadata rows is enough; blobs are shared
- **Integrity checking** — fingerprint mismatch = corruption

For detailed coverage, see [subsystems/data-layer.md](subsystems/data-layer.md).

---

## 7. AI Chat System

The chat system supports multiple AI providers via adapter pattern.

### Provider Adapters

Each provider implements a streaming interface:
- **Anthropic** — Claude models via direct API call with user's API key (BYOK)
- **OpenAI** — GPT models via OpenAI-compatible API
- **Google** — Gemini models via Google AI API

Provider configuration (model list, context window sizes, token limits) lives in `providers.ts`. The active provider is determined by the selected model.

### Tool System

The AI can call tools that execute locally in the browser:
- `write_file` — create/update an artifact
- `read_file` — read artifact content (supports PDF and DOCX text extraction)
- `edit_file` — edit specific lines in a file
- `list_files` — list all artifacts
- `delete_file` — request file deletion (requires user confirmation)
- `get_palette` — read current CSS palette
- `set_palette` — modify CSS custom properties

Tool results are written back to the conversation and the AI continues from there.

### Token Truncation

Messages are automatically truncated to fit the model's context window. The system tracks token usage from real API response data and truncates older messages when approaching the limit. Provider-specific limits are defined in `providers.ts`.

For detailed coverage, see [subsystems/ai-chat.md](subsystems/ai-chat.md).

---

## 8. The Workspace (Pane System)

The crux workspace is a multi-pane resizable layout using `react-mosaic-component`.

### Pane Types

| Pane | Component | Purpose |
|------|-----------|---------|
| `collaboration` | ChatPane | AI conversation |
| `artifacts` | ArtifactsPane | File tree with drag-and-drop |
| `workshop` | EditorPane | Monaco editor + preview |
| `details` | MetadataPane | Crux metadata editor |
| `history` | HistoryPane | Growth timeline (snapshots) |
| `store` | StorePane | Per-crux key-value store viewer |
| `sync` | SyncPane | Sync status |
| `publish` | PublishPane | Publish controls |
| `export` | ExportPane | Export/import |

### Layout Persistence

Layout is persisted at two levels:
- **Global**: `cruxgarden:layout:global` — default pane arrangement
- **Per-crux**: `cruxgarden:layout:{cruxId}` — crux-specific overrides

`setActiveCrux(id)` saves the current state and loads the target crux's persisted layout, editor tabs, and folder state.

### Desktop vs Mobile

- Desktop: multi-pane mosaic layout with drag handles
- Mobile: single active pane with bottom switcher bar

For detailed coverage, see [subsystems/workspace.md](subsystems/workspace.md).

---

## 9. Artifacts & File Management

Artifacts are files in a crux. Metadata lives in SQLite, content in OPFS blobs.

### File CRUD

| Action | How |
|--------|-----|
| Create | `createFile(path, content)` → SHA-256 fingerprint → blob write → SQLite insert |
| Upload | File → blob write → SQLite upsert (merge by path) |
| Move | Update `meta.path` in SQLite |
| Rename | Update `meta.path` and `filename` |
| Delete | Remove SQLite row (blob may persist if shared) |
| Save | New content → new fingerprint → blob write → SQLite update |

### File Tree (ArtifactsPane)

Uses `react-arborist` — a virtualized tree component with drag-and-drop, inline rename, and context menu. The flat `artifacts[]` array is converted to a nested tree structure by `treeData.ts` using `meta.path` to derive parent/child relationships.

### Conflict Detection

Upload, drag-and-drop, and folder creation all check for existing paths before proceeding. Conflicts prompt the user with `confirm()` before overwriting.

### Editor (Workshop Pane)

Monaco Editor with multi-tab support. View modes: source (Monaco), preview (iframe), and form (for template schemas). `useFileContent` hook downloads blob content and converts to text or blob URL.

### HTML Preview System

1. `usePreviewUrl` downloads all artifacts
2. Writes them to the Cache API at `/__preview/{cruxId}/...` paths
3. Service worker (`preview-sw.js`) intercepts these URLs and serves from cache
4. Preview iframe loads `/__preview/{cruxId}/index.html`
5. Relative asset references resolve naturally through the service worker

For detailed coverage, see [subsystems/artifacts.md](subsystems/artifacts.md).

---

## 10. Version History (Growth System)

Growth dimensions are automatic version snapshots created after the AI modifies files.

### Snapshot Flow

1. AI modifies files during chat → `useChat` sets `pendingGrowthCreation`
2. Growth creation hook detects the flag after streaming ends
3. `createSnapshot()` in `growth.service.ts` creates a new dimension with metadata
4. Snapshot metadata includes: label, summary, artifact fingerprints, message range
5. Snapshots are content-addressable — cloning is metadata-only (instant)

### Snapshot Viewing

Authors can view any snapshot. The workspace stashes current state and loads the snapshot's artifacts and messages. A `SnapshotBanner` appears with Branch/Revert/Back options.

### Branching

The growth system supports DAG-aware branching. `loadCrux` walks the `parentCruxId` chain. `branchFromSnapshot` creates a new crux from a snapshot point with its own growth history.

### Auto-Snapshot

Configurable granularity: every AI turn, 2m, 5m, 10m, or manual only.

For detailed coverage, see [subsystems/growth.md](subsystems/growth.md).

---

## 11. Publishing & Display

Publishing makes a crux visible at a public URL. The system has two sides: the publish flow (authenticated) and display mode (public).

### Publish Flow

1. Author hits Publish in the PublishPane
2. App generates a `.crux` export
3. Uploads crux metadata + artifacts to the API (sync-on-publish)
4. API extracts artifacts and writes to S3 at `/{cruxId}/`
5. API applies publish injections to HTML files (SPA support, store client)
6. CloudFront invalidation fires for the crux's path

### Per-Crux Subdomain Isolation

Each published crux is served from its own origin: `{cruxId}.publish.crux.garden`. Infrastructure:

- **Wildcard DNS**: `*.publish.crux.garden` → CloudFront
- **Wildcard SSL cert**: ACM cert covering `publish.crux.garden` + `*.publish.crux.garden`
- **Lambda@Edge** (viewer-request): extracts UUID from subdomain, rewrites S3 path, handles SPA fallback (no file extension → `index.html`)

This provides full browser origin isolation: each crux has its own localStorage, cookies, service workers.

### Publish Injections

Scripts injected into HTML during publish:
- **SPA index strip** — removes `/index.html` from URL
- **SPA basename** — sets `window.__CRUX_BASENAME__ = '/'`
- **SPA navigate sync** — patches `pushState`/`replaceState` to notify parent frame of route changes
- **Crux Store client** — injects `window.crux.store` SDK with get/set/increment/delete/list

### Display Mode (PublicCrux)

The public page at `crux.garden/{username}/{slug}` renders the published crux in an iframe pointing to `{cruxId}.publish.crux.garden`. A handshake process establishes communication:

1. Iframe's injected script sends `crux:ready` to parent
2. Parent responds with `crux:session` containing auth token, crux ID, API base, and mode
3. Store client initializes with the session data
4. Navigate sync keeps the parent URL updated as the user navigates within the crux

### Content Resolution (ArtifactRenderer)

Priority chain for determining what to display:
1. `index.html` at root → HTML mode (iframe)
2. Any `.html`/`.htm` → HTML mode
3. `README.md` → Markdown mode
4. Any `.md`/`.mdx` → Markdown mode
5. Single image → Image mode
6. Fallback → File listing

For detailed coverage, see [subsystems/publishing.md](subsystems/publishing.md).

---

## 12. Crux Store

A per-crux key-value store that enables persistent, stateful published apps.

### SDK

Published cruxes access the store via `window.crux.store`:

```js
await crux.store.get('key')
await crux.store.set('key', value, { mode: 'public' })
await crux.store.increment('counter')
await crux.store.delete('key')
await crux.store.list()
```

### Two Modes

- **Local** (workspace preview): store calls route via postMessage to the parent workspace, which proxies them to SQLite via `useStoreProxy`
- **Live** (published): store calls go directly to the API (`/store/{cruxId}/{key}`)

### Key Modes

- **`public`** — one shared value per key, readable/writable by anyone
- **`protected`** (default) — one value per visitor per key, requires authentication

### API Endpoints

`GET/PUT/DELETE /store/:cruxId/:key`, `POST /store/:cruxId/:key/inc`, `GET /store/:cruxId` (list)

For detailed coverage, see [subsystems/crux-store.md](subsystems/crux-store.md).

---

## 13. Authentication

JWT-based with email + code flow (no passwords).

1. User enters email → `POST /auth/code` → server sends 6-digit code
2. User enters code → `POST /auth/login` → server returns access + refresh tokens
3. Tokens stored in localStorage
4. Axios interceptor auto-attaches Bearer token to API requests
5. On 401, interceptor auto-refreshes via `POST /auth/token` (concurrent refreshes deduped)
6. On refresh failure, tokens cleared (user remains on current page — local-first still works)

### Local-First Auth

The app creates a local anonymous author on first use. When the user connects a crux.garden account, the local author ID is reconciled with the server. Avatar is stored as a data URL locally and synced to the API.

### Public Page Auth

Public pages (`/:username/:slug`) do lightweight auth init — check stored tokens, refresh if expired, but skip SQLite initialization. This ensures the `crux:session` handshake sends a valid token to the published iframe.

For detailed coverage, see [subsystems/auth.md](subsystems/auth.md).

---

## 14. Mood System

Creative environments that control palette, AI persona, avatar, and background.

### What a Mood Contains

- **Palette overrides** — CSS custom property values that override the defaults
- **Background type** — bloom, starfield, flowfield, drift, or custom image
- **Persona** — AI name, description, system prompt, and greeting
- **Tags** — categorization labels
- **Avatar** — custom image for the AI

### Presets

30 built-in presets (15 dark, 15 light) with full palette overrides. Stored in `lib/moods/presets.ts`.

### Persistence

The active mood is persisted to both SQLite settings and localStorage (for splash screen color matching). Mood cruxes are stored as regular cruxes with `type: 'mood'`.

For detailed coverage, see [subsystems/mood.md](subsystems/mood.md).

---

## 15. Crux Kinds

The `CruxKind` enum controls kind-specific behaviors:

| Kind | Behavior |
|------|----------|
| `webapp` | SPA injections at publish time |
| `page` | Single page, no SPA routing |
| `document` | Formatted text display |
| `image` | Image display |
| `notes` | Auto-generates `manifest.json` from `notes/` folder. Vault viewer with sidebar nav, wiki links, callouts |
| `snapshot` | Internal — growth snapshots |

Kind-specific hooks:
- `useNotesManifest` — watches artifacts in `notes/` cruxes and regenerates the manifest

---

## 16. Export & Import

### Crux Export (`.crux`)

A ZIP archive containing everything needed to recreate a crux:

```
my-project.crux
├── manifest.json     — version, export date, author
├── crux.json         — entity data, summary, settings
├── messages.json     — per-version message segments
├── dimensions.json   — growth history (index-based refs)
├── store.json        — crux store entries
└── artifacts/        — file blobs at their virtual paths
```

### Garden Backup (`.garden`)

Full SQLite database + all OPFS blobs in a ZIP. Complete local state backup.

### Import

Always creates a fresh crux — never overwrites. Restores metadata, messages, artifacts, and dimensions.

---

## 17. Styling System

### CSS Architecture

Tailwind CSS 4 with CSS custom properties driving the theme. `globals.css` defines:

- `@font-face` for JetBrains Mono (display/mono) and Outfit (body), self-hosted
- `@theme` block bridging CSS vars to Tailwind utilities (`--color-accent: var(--accent)`)
- Dark (default) and light theme blocks
- Palette transition class for smooth theme changes
- highlight.js color overrides

### Palette

28+ CSS custom properties across categories:
- **Core**: `--bg`, `--surface`, `--text`, `--accent`, `--border`, `--error`
- **Pane colors**: `--pane-collaboration` through `--pane-store`
- **Bloom gradient**: `--bloom-bg1/bg2`, `--bloom-1` through `--bloom-6`
- **Background controls**: `--background-type`, star/flow/drift colors
- **Syntax highlighting**: `--syntax-comment` through `--syntax-punctuation`

### Utility: `cn()`

Combines `clsx` (conditional class joining) with `tailwind-merge` (deduplicates conflicting Tailwind classes).

---

## 18. Key Libraries

| Library | Purpose |
|---------|---------|
| `react` 19 | UI framework |
| `zustand` 5 | State management |
| `react-router-dom` 7 | Routing |
| `@monaco-editor/react` | Code editor |
| `react-arborist` | Virtualized file tree |
| `react-mosaic-component` | Resizable pane layout |
| `react-markdown` + `remark-gfm` + `rehype-highlight` | Markdown rendering |
| `react-photo-view` | Image lightbox |
| `wa-sqlite` | WASM SQLite for OPFS |
| `jszip` | Client-side ZIP generation |
| `axios` | HTTP client (API calls) |
| `highlight.js/core` | Syntax highlighting |

---

## Subsystem Deep Dives

Each subsystem has its own detailed document in [subsystems/](subsystems/):

- [stores.md](subsystems/stores.md) — all six Zustand stores in detail
- [data-layer.md](subsystems/data-layer.md) — SQLite, OPFS, service layer, content addressing
- [ai-chat.md](subsystems/ai-chat.md) — provider adapters, tool system, streaming, token management
- [workspace.md](subsystems/workspace.md) — mosaic layout, pane system, editor, preview
- [artifacts.md](subsystems/artifacts.md) — file CRUD, tree, upload, conflict detection
- [growth.md](subsystems/growth.md) — snapshots, timeline, branching, auto-snapshot
- [publishing.md](subsystems/publishing.md) — publish flow, injections, subdomain isolation, display mode
- [crux-store.md](subsystems/crux-store.md) — KV store SDK, postMessage proxy, API endpoints
- [auth.md](subsystems/auth.md) — JWT flow, token refresh, local-first auth
- [mood.md](subsystems/mood.md) — palette, presets, persona, backgrounds
