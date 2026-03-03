# Crux Garden App — Architecture Guide

This document traces the app from its entry point through every architectural layer and subsystem. It's meant to be read top-to-bottom as a walkthrough.

---

## 1. Entry Point

Everything starts from three files:

### `index.html`

A standard Vite HTML shell. Contains `<div id="root">` and a `<script type="module" src="/src/main.tsx">` tag. Vite injects the built bundle here.

### `src/main.tsx`

The React bootstrap. Does four things:

1. **Renders `<Bootstrap />`** inside `<StrictMode>` — the Bootstrap component calls `authStore.init()` on mount to check for stored JWT tokens and restore a session.
2. **Suppresses Monaco editor errors** — Monaco doesn't handle Strict Mode's double-invoke of effects. A custom `onCaughtError` handler on `createRoot` silences `InstantiationService has been disposed` errors. A global `window.error` listener catches the async disposal errors that escape React's boundary.
3. **Registers the preview service worker** — `preview-sw.js` intercepts `/__preview/{cruxId}/...` URLs and serves cached artifact files from the Cache API. This is how HTML preview works in the editor.
4. **Imports `globals.css`** — all CSS custom properties, font faces, Tailwind, and highlight.js styles.

### `src/App.tsx`

Creates the router and renders it. Two key things happen here:

- `<AnimatedBackground />` renders behind everything (bloom gradient, starfield, or flow field — controlled by a CSS custom property `--background-type`).
- `<RouterProvider router={router} />` drives all navigation.

---

## 2. Routing

The app uses React Router v7 with `createBrowserRouter`. Routes split into three groups:

### Public routes (no auth required)

| Path | Page | Purpose |
|------|------|---------|
| `/` | `Landing` | Marketing homepage |
| `/login` | `Login` | Email + code auth flow |
| `/:username/:slug` | `PublicCrux` | Published crux display mode |
| `/:username` | `PublicAuthor` | Author's public profile/gallery |

### Protected routes (behind `AuthGuard`)

| Path | Page | Purpose |
|------|------|---------|
| `/home` | `Garden` | User's crux library |
| `/c/:id` | `Crux` | The workspace (where everything happens) |
| `/settings` | `Settings` | Profile, API key, preferences |

### Route protection: `AuthGuard`

`AuthGuard` (`src/components/auth/AuthGuard.tsx`) is a layout route wrapper. It reads `authStore.isAuthenticated` and `authStore.isLoading`:

- While loading: renders a centered spinner
- If not authenticated: redirects to `/login`
- If authenticated: renders `<Outlet />` (the child route)

### Layout wrapper: `AppShell`

Protected routes are nested inside `AppShell` (`src/components/layout/AppShell.tsx`), which provides:

- **TopBar** — persistent header with breadcrumb navigation, pane toggle buttons, and user menu
- **`<Outlet />`** — the active page fills the remaining vertical space
- **CommandPalette** — `Cmd+K` opens a fuzzy search for cruxes and settings
- **KeeperConsole** — `Escape` opens an AI assistant sidebar

The nesting is: `AuthGuard` > `AppShell` > Page.

---

## 3. State Management (Zustand)

All app state lives in five Zustand stores. Components subscribe to individual slices via selectors — `useAuthStore((s) => s.isAuthenticated)` — so only the subscribed values trigger re-renders.

### `authStore` — Identity

**File:** `src/stores/authStore.ts` (125 lines)

Manages who you are. State:

- `account: Profile | null` — email, role, homeId
- `author: Author | null` — username, displayName, bio, avatar
- `isAuthenticated: boolean`
- `isLoading: boolean` — true during init (checking stored tokens)

Key actions:

| Action | What it does |
|--------|-------------|
| `init()` | On app mount — checks localStorage for tokens, calls `GET /auth/profile`. If the access token is expired, tries refresh. If that fails, clears tokens. |
| `requestCode(email)` | `POST /auth/code` — server sends a login code via email |
| `login(email, code)` | `POST /auth/login` — exchanges code for JWT tokens, fetches profile |
| `logout()` | `POST /auth/logout` + clears localStorage tokens |
| `updateAuthor(dto)` | Updates username/displayName/bio via API |
| `uploadAvatar(file)` / `removeAvatar()` | Avatar management via API |

Token storage uses three localStorage keys: `cruxgarden:accessToken`, `cruxgarden:refreshToken`.

### `cruxStore` — Active Workspace

**File:** `src/stores/cruxStore.ts` (435 lines)

The largest and most important store. Manages the currently-open crux and everything in it.

**State:**

```
crux: Crux | null              // The active crux entity
messages: ChatMessage[]         // Full conversation history
artifacts: Attachment[]         // All files in this crux
summary: CruxSummary | null    // AI-generated project summary

isStreaming: boolean            // Currently receiving SSE
streamingContent: string        // Partial text being streamed

hasUnpublishedChanges: boolean  // Something changed since last publish
artifactsVersion: number        // Increments on any artifact change

gates: Dimension[]              // Version history entries
gateCount: number               // Total gate count
isCreatingGate: boolean         // Gate generation in progress
pendingGateCreation: boolean    // Signal to create a gate after streaming ends

pendingDeletes: {attachmentId, path}[]  // Files the AI requested to delete (awaiting confirmation)
```

**Action groups:**

- **Crux lifecycle:** `loadCrux(id)`, `createCrux(title?)`, `updateCrux(dto)`, `reset()`
- **Chat:** `addMessage()`, `setStreaming()`, `appendStreamContent()`, `clearStreamContent()`
- **Artifacts:** `setArtifacts()`, `addArtifact()`, `updateArtifact()`
- **File CRUD:** `createFile(path)`, `uploadFile(file)`, `moveArtifact()`, `renameArtifact()`, `deleteArtifact()`, `saveArtifactContent()`
- **Publishing:** `publishCrux()`, `unpublishCrux()`
- **Gates:** `loadGates()`, `addGate()`, `setSummary()`, `setPendingGateCreation()`
- **Delete confirmation:** `addPendingDelete()`, `confirmDelete()`, `dismissDelete()`
- **Settings:** `setModel()`, `setPalette()`, `saveMeta()`

`loadCrux(id)` fetches the crux and its attachments, detects if changes exist after the last publish (compares timestamps), and populates the store.

`createCrux()` generates a slug from the title + base-36 timestamp, sets a system prompt ("You are The Keeper..."), and creates via API.

`saveMeta()` persists the current messages, summary, and gateCount back to the crux's `meta` field via `PATCH /cruxes/:id`.

`deleteArtifact(id)` also dynamically imports uiStore to close any editor tab for the deleted file.

### `uiStore` — Layout & Editor State

**File:** `src/stores/uiStore.ts` (606 lines)

The most complex store. Controls how the workspace looks: which panes are visible, their order, editor tabs, folder state, context menus, and mobile mode.

**Pane system:**

There are 8 pane types: `history`, `collaboration`, `artifacts`, `workshop`, `details`, `sync`, `publish`, `export`.

- `paneOrder: PaneType[]` — determines left-to-right arrangement
- `paneVisibility: Record<PaneType, boolean>` — which are shown
- Default: only `collaboration` is visible on first load

**Editor state:**

```
editor: {
  tabs: EditorTab[]      // {id, path, name, dirty, viewMode, scrollTop}
  activeTabId: string     // Which tab is focused
  diffTargetId: string    // For diff view comparison
}
```

**Persistence (localStorage):**

Layout is persisted at two levels:

- **Global:** `cruxgarden:layout:global` — default pane arrangement
- **Per-crux:** `cruxgarden:layout:{cruxId}` — crux-specific layout overrides
- **Editor tabs:** `cruxgarden:editor-tabs:{cruxId}` — which files are open
- **Folder state:** `cruxgarden:folder-state:{cruxId}` — which tree folders are expanded

Resolution order: per-crux layout > global layout > defaults.

The store includes **migration logic** for old pane names (`navigation` -> `history`, `chat` -> `collaboration`, `editor` -> `workshop`, `metadata` -> `details`).

**`setActiveCrux(id)`** is the pivot action — called when entering/leaving a crux workspace. It saves the current state, loads the target crux's persisted layout, editor tabs, and folder state.

**Scroll position** uses a debounced save (500ms) to avoid thrashing localStorage.

**Legacy compatibility** — computed getters (`fileViewerOpen`, `timelineOpen`) map the old property names to the current pane system.

### `gardenStore` — Crux Library

**File:** `src/stores/gardenStore.ts` (79 lines)

Manages the list of all your cruxes for the Garden page.

- `cruxList`, `loading`, `search`, `sortBy`, `pagination`
- `load()` fetches from `GET /cruxes`, then filters and sorts client-side (the API doesn't support search yet)
- Search is substring matching on title, slug, description
- Sort is newest-first by `created` or `updated`

### `themeStore` — Visual Mode

**File:** `src/stores/themeStore.ts` (44 lines)

Simple dark/light/auto toggle.

- Reads initial mode from `localStorage: cruxgarden:theme` (defaults to `dark`)
- Resolves `auto` via `window.matchMedia('(prefers-color-scheme: light)')`
- Applies by toggling `dark`/`light` class on `<html>` element
- CSS custom properties in `globals.css` change based on this class

---

## 4. API Layer

All server communication goes through `src/api/`. The barrel export is `src/api/index.ts`.

### HTTP Client (`src/api/client.ts`)

An Axios instance configured with:

- **Base URL:** `VITE_API_URL` env var, defaults to `http://localhost:3000`
- **Request interceptor:** attaches `Authorization: Bearer {accessToken}` from localStorage
- **Response interceptor:** on 401, attempts token refresh via `POST /auth/token`. Concurrent 401s are deduped — only one refresh request fires. On refresh failure, tokens are cleared (user is logged out).

### API Modules

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| `auth.ts` | `POST /auth/code`, `POST /auth/login`, `POST /auth/token`, `GET /auth/profile`, `DELETE /auth/logout` | Authentication |
| `cruxes.ts` | CRUD on `/cruxes`, dimensions, attachments, publishing, tags | Core data |
| `authors.ts` | `GET/PUT /authors/:id`, avatar upload/remove | Author profile |
| `ai.ts` | `POST /ai/chat` (SSE) | AI streaming |
| `public.ts` | `GET /public/authors/:username/cruxes/:slug` + attachments | Unauthenticated public view |
| `paths.ts` | CRUD on `/paths`, markers | Path management (future) |

### SSE Streaming (`src/api/ai.ts`)

The AI module does NOT use Axios. It uses the native `fetch` API because Axios doesn't support streaming responses.

`streamChat(cruxId, messages, onEvent, model?, signal?)`:

1. Sends `POST /ai/chat` with JWT auth header + optional `X-Anthropic-Key` header (user's own API key)
2. Reads the response body as a stream via `ReadableStream.getReader()`
3. Parses SSE events from the text stream (lines starting with `event:` and `data:`)
4. Calls `onEvent()` for each parsed event

SSE event types:

| Event | Data | Meaning |
|-------|------|---------|
| `text` | `{content}` | Text delta from the AI |
| `tool_start` | `{id, name, input}` | AI is calling a tool |
| `tool_result` | `{id, name, result}` | Tool execution completed |
| `delete_request` | `{attachmentId, path}` | AI wants to delete a file (needs confirmation) |
| `error` | `{message}` | Error during generation |
| `done` | `{}` | Stream finished |

### Type Definitions (`src/api/types.ts`)

290 lines of TypeScript interfaces covering every entity:

- **Auth:** `AuthCredentials`, `Profile`
- **Core:** `Author`, `Crux`, `Attachment`, `Dimension`, `Tag`, `Theme`, `Path`, `Marker`
- **Chat:** `ChatMessage` (role, content, toolCalls), `ToolCall` (name, input, result)
- **Meta:** `CruxMeta` (messages, summary, settings, snapshot, artifactRefs, messageRange)
- **DTOs:** `CreateCruxDto`, `UpdateCruxDto`, `CreateAuthorDto`, etc.

---

## 5. The Chat System

The chat system is how users interact with the AI. It spans the API layer, a hook, and the store.

### `useChat` Hook (`src/hooks/useChat.ts`)

The central orchestrator. It bridges the cruxStore (state) and the SSE stream (server).

**`send(content)`** — the main action:

1. Creates a `ChatMessage` with role `user` and adds it to the store
2. Calls `buildApiMessages()` to convert the full message history into Anthropic API format
3. Opens an SSE stream via `streamChat()`
4. Processes events as they arrive:
   - `text` — appends to `streamingContent` for live rendering
   - `tool_start` — pushes to a local `toolCalls[]` array
   - `tool_result` — updates the tool call's result, refreshes artifacts from the server
   - `delete_request` — adds to `pendingDeletes` in cruxStore
   - `error` — appends error text
5. After the stream ends, adds the assistant message to the store (with tool calls attached)
6. Saves meta to the server
7. If any file-mutation tool was called (`write_file`, `edit_file`, `delete_file`), sets `pendingGateCreation: true`

**`buildApiMessages()`** — critical for multi-turn tool use:

Anthropic's API requires alternating user/assistant roles with proper `tool_use`/`tool_result` blocks. This function:

- Converts assistant messages with `toolCalls` into content block arrays with `type: "tool_use"` entries
- Creates corresponding `tool_result` blocks and merges them with the next user message (to maintain alternating roles)
- Truncates large tool results to 1200 chars

**`stop()`** — aborts the current stream via `AbortController`.

### Message Rendering

Messages flow from the store through:

- `ChatPane` → `ChatPanel` → `MessageList` → `MessageBubble`
- `MessageBubble` renders markdown via `MarkdownRenderer` (react-markdown + remark-gfm + rehype-highlight)
- Tool calls are rendered as collapsible chips showing the tool name and input/result
- During streaming, `streamingContent` is rendered with a typing animation

---

## 6. The Gate System (Version History)

Gates are automatic version snapshots created after the AI modifies files.

### `useGates` Hook (`src/hooks/useGates.ts`)

A reactive hook that watches for `pendingGateCreation` and triggers gate creation when streaming ends.

**Gate creation flow (5 steps):**

1. **Generate snapshot** — sends the recent conversation excerpt to the AI with a structured prompt. The AI returns a snapshot with fields: GATE, STATE, DECISION, REJECTED, REASON, ARTIFACTS, OPEN.
2. **Create gate crux** — creates a new Crux of type `gate` with the snapshot in its meta, linked to the parent crux via `parentCruxId`.
3. **Link via dimension** — creates a `gate` dimension from the parent crux to the gate crux with `weight` = gate number (for ordering).
4. **Generate summary** — sends the snapshot to the AI to update the running project summary (CRUX, PURPOSE, STAGE, THEMES, STACK).
5. **Save meta** — updates the parent crux's meta with the new summary and gate count.

**Reconciliation:** Every 10 gates, the summary is regenerated from scratch using the entire gate chain.

Gate snapshots use the same SSE streaming endpoint as chat (`POST /ai/chat`) via a helper `collectStreamText()` that accumulates text events.

### Gate UI

- `NavigationPane` → `GateTimeline` → `GateCard` renders the vertical timeline
- `CruxSummary` renders the rolling summary above the timeline
- Each gate card shows its title (from `snapshot.gate`), state, and timestamp

---

## 7. The Workspace (Pane System)

The crux workspace is an 8-pane resizable layout. This is the heart of the app.

### `Crux` Page (`src/pages/Crux.tsx`)

The page-level container. On mount:

1. Calls `loadCrux(id)` and `setActiveCrux(id)` (restores layout from localStorage)
2. Watches `artifacts.length` to auto-show the Artifacts and Workshop panes when the first artifact appears
3. Sets `document.title` to the crux title
4. Sets up unsaved-changes protection — `beforeunload` event + React Router's `useBlocker` with a Save/Discard/Stay modal
5. Renders `<WorkspaceLayout />`

### `WorkspaceLayout` (`src/components/workspace/WorkspaceLayout.tsx`)

The layout engine. Uses `react-resizable-panels` for the panel grid.

**How it works:**

1. Reads `paneOrder` and `paneVisibility` from uiStore
2. Filters to `visiblePanes` — only panes where visibility is true
3. Renders a horizontal `<Group>` of `<Panel>` components with `<ResizeHandle>` separators
4. Each panel wraps a `<DraggablePane>` (drop zone for drag-to-reorder) around the pane component
5. Pane components are looked up from `PANE_COMPONENTS` — a static map of `PaneType` to React component

**Pane configuration:**

| Pane | Min Size | Default Size | Component |
|------|----------|-------------|-----------|
| `history` | 10% | 18% | `NavigationPane` |
| `collaboration` | 20% | 40% | `ChatPane` |
| `artifacts` | 10% | 16% | `ArtifactsPane` |
| `workshop` | 15% | 26% | `EditorPane` |
| `details` | 10% | 16% | `MetadataPane` |
| `sync` | 10% | 16% | `SyncPane` |
| `publish` | 10% | 16% | `PublishPane` |
| `export` | 10% | 16% | `ExportPane` |

**Desktop vs mobile:**

- Desktop: multi-pane horizontal layout (shown at `md:` breakpoint and above)
- Mobile: single active pane with a `MobilePaneSwitcher` bottom bar

**Context menu:** A global `<ContextMenu>` handles right-click actions in the file tree (new file, new folder, rename, delete, open, copy URL).

### TopBar Pane Toggles

The TopBar shows one icon button per pane type. Enabled panes appear in `paneOrder` with their accent color; disabled panes appear dimmed after a divider. Clicking toggles visibility. Each pane has a distinct color read from CSS custom properties (`--pane-collaboration`, `--pane-artifacts`, etc.).

---

## 8. Artifacts & File Management

Artifacts are files attached to a crux — the things the AI creates.

### Data Model

Artifacts are `Attachment` entities on the server. Key fields:

```typescript
{
  id: string           // UUID
  filename: string     // Original filename
  mimeType: string     // e.g. "text/html"
  meta: {
    path?: string      // Virtual file path (e.g. "src/index.html")
  }
  size: number
  encoding: string
  created: string
  updated: string
}
```

The `meta.path` field stores the virtual directory structure. The actual file content is stored in S3 (or mocked locally).

### File CRUD in `cruxStore`

| Action | How it works |
|--------|-------------|
| `createFile(path)` | Creates an empty Blob, wraps in File, uploads via `POST /cruxes/:id/attachments` with path in meta |
| `uploadFile(file, parentPath?)` | Prepends parentPath to filename, uploads via FormData |
| `moveArtifact(id, newParentPath)` | Updates the `meta.path` via `PUT /attachments/:id` |
| `renameArtifact(id, newPath)` | Same mechanism, new path |
| `deleteArtifact(id)` | `DELETE /attachments/:id`, removes from local state, closes editor tab |
| `saveArtifactContent(id, content)` | Creates a new Blob from content, uploads as file replacement via `PUT /attachments/:id` |

### File Tree (`ArtifactsPane`)

The file tree uses `react-arborist` — a virtualized tree component with:

- Drag-and-drop (move files between folders)
- Inline rename (double-click or F2)
- Context menu (right-click)
- Folder expand/collapse state persisted per crux

Tree data is converted from the flat `artifacts[]` array into a nested tree structure by `treeData.ts`, using the `meta.path` of each attachment to derive parent/child relationships.

### Editor (`EditorPane` / `EditorContent`)

The Workshop pane hosts a Monaco Editor instance:

- Opens files via the `openFile(id, path)` action on uiStore
- Loads file content via `useFileContent` hook (downloads blob from API, converts to text or blob URL)
- Tracks dirty state — marks tab dirty on edit, clears on save
- Save: `Cmd+S` triggers `saveArtifactContent()`, which uploads the new content
- View modes: `source` (Monaco editor) or `preview` (HTML rendered in iframe)

### `useFileContent` Hook

Downloads attachment content via `cruxes.downloadAttachment()`. For text MIME types, reads the blob as text. For binary (images, etc.), creates an object URL. Returns `content` (string) or `blobUrl` (for images). Includes a `refetch()` method and `contentVersion` counter (used as a React key to force Monaco to remount with fresh content).

### HTML Preview System

For HTML files, the Workshop pane can toggle to "preview" mode:

1. `usePreviewUrl` hook downloads all artifacts for the crux
2. Writes them to the browser's **Cache API** at virtual paths like `/__preview/{cruxId}/style.css`
3. A **service worker** (`preview-sw.js`) intercepts fetch requests matching `/__preview/*` and serves from the cache
4. The preview iframe loads `/__preview/{cruxId}/index.html?v=N` — the service worker serves the cached HTML
5. When the HTML content changes (live editing), only the HTML entry is updated in the cache (no re-download of other assets)

This architecture means the preview iframe can load relative assets (`./style.css`, `./images/logo.png`) naturally — the service worker resolves them from the same cache.

URL rewriting (`src/lib/rewriteUrls.ts`) handles `src`, `href`, and CSS `url()` references — resolving relative paths against the file's directory.

---

## 9. Publishing & Display Mode

Publishing makes a crux visible at a public URL.

### Publish Flow

1. User clicks publish in the Publish pane or TopBar
2. `cruxStore.publishCrux()` saves meta, then calls `POST /cruxes/:id/publish`
3. Server sets `meta.publishedAt` timestamp and visibility
4. Crux is now accessible at `/@username/slug`

`hasUnpublishedChanges` tracks whether anything changed since the last publish — file edits, metadata updates, or new artifacts all set this flag.

### Public Display (`PublicCrux` page)

Unauthenticated route at `/:username/:slug`. Uses the `public` API module (no JWT required).

1. Fetches crux and attachments via `GET /public/authors/:username/cruxes/:slug`
2. `ArtifactRenderer` determines the display mode based on content:
   - HTML files: rendered in a sandboxed iframe using `srcdoc` with URL rewriting for multi-file sites
   - Markdown: rendered via react-markdown
   - Images: displayed with react-photo-view
3. `HistoryViewer` shows the conversation that produced the crux — "How was this made?"
4. A metadata sidebar shows title, author, summary, creation date

---

## 10. Styling System

### CSS Architecture

The app uses Tailwind CSS 4 with a custom property-driven theme system.

**`src/styles/globals.css`** (328 lines):

- Imports Tailwind, bloom animations, and highlight.js styles
- Defines `@font-face` for JetBrains Mono (400, 500, 700) and Outfit (variable weight)
- Defines a `@theme` block bridging CSS custom properties to Tailwind color utilities (e.g. `--color-accent: var(--accent)` makes `text-accent` work)
- Two theme blocks: `:root, .dark` (default) and `.light`
- Custom scrollbar styling
- Palette transition class for smooth theme changes
- highlight.js color overrides using CSS custom properties

### Custom Properties

The palette system defines **60+ CSS custom properties** across several categories:

**Core colors (14):** `--bg`, `--surface`, `--surface-solid`, `--panel`, `--text`, `--text-muted`, `--border`, `--accent`, `--accent-muted`, `--error`, `--error-muted`, `--contrast`, `--overlay`, `--preview-bg`

**Pane colors (8):** `--pane-collaboration` through `--pane-publish` — each pane has a distinct accent color

**Bloom gradient (8):** `--bloom-bg1`, `--bloom-bg2`, `--bloom-1` through `--bloom-6`

**Bloom animation (3):** `--bloom-opacity`, `--bloom-blur`, `--bloom-speed`

**Background controls:** `--background-type`, star/flow field colors and speeds

**Shape:** `--radius` (0.5rem), `--radius-sm` (0.375rem)

**Syntax highlighting (7):** `--syntax-comment` through `--syntax-punctuation`

### Palette System (`src/lib/palette.ts`)

Defines a `Palette` TypeScript interface mapping camelCase keys to CSS property names. Provides:

- `DARK_PALETTE` and `LIGHT_PALETTE` constants with all default values
- `KEY_TO_VAR` map (camelCase → CSS property name)
- `getCurrentPalette()` reads computed styles from `document.documentElement`

The AI can potentially change any of these properties mid-conversation via the `set_palette` tool — though runtime palette overrides are currently disabled (CSS defaults are the source of truth).

### Utility: `cn()`

`src/lib/cn.ts` — combines `clsx` (conditional class joining) with `tailwind-merge` (deduplicates conflicting Tailwind classes). Used everywhere for conditional styling.

### Animated Backgrounds

Three background types, rendered behind all content by `AnimatedBackground`:

1. **Bloom** (`bloom.css`) — 6 colored blobs with CSS `@keyframes` animations, layered with a goo SVG filter and backdrop blur
2. **Starfield** — canvas-based particle system drawing white dots
3. **Flow field** — canvas-based flowing line visualization

Controlled by `--background-type` CSS property.

---

## 11. Hooks Reference

| Hook | File | Purpose |
|------|------|---------|
| `useChat` | `hooks/useChat.ts` | SSE streaming, message building, tool call processing |
| `useGates` | `hooks/useGates.ts` | Gate creation after file mutations, summary generation |
| `useGarden` | `hooks/useGarden.ts` | Crux list loading, search, delete, new crux navigation |
| `useFileContent` | `hooks/useFileContent.ts` | Download + cache attachment content for editing |
| `usePreviewUrl` | `hooks/usePreviewUrl.ts` | Service worker cache for HTML preview iframe |
| `usePublicPreviewUrl` | `hooks/usePublicPreviewUrl.ts` | Preview URLs for published cruxes (unauthenticated) |
| `usePaneWidth` | `hooks/usePaneWidth.ts` | Read pane pixel width from ResizablePanels context |

---

## 12. Component Directory

### `components/layout/`

| Component | Purpose |
|-----------|---------|
| `AppShell` | Top-level wrapper: TopBar + Outlet + CommandPalette + KeeperConsole |
| `TopBar` | Breadcrumb nav, pane toggle buttons, user menu |
| `Sidebar` | Navigation links (Home Garden, Settings) |
| `CommandPalette` | Cmd+K fuzzy search for cruxes and actions |
| `AnimatedBackground` | Renders bloom/starfield/flowfield behind everything |
| `BloomBackground` | 6-blob CSS gradient animation |
| `StarfieldBackground` | Canvas particle system |
| `FlowFieldBackground` | Canvas flow line visualization |

### `components/workspace/`

| Component | Purpose |
|-----------|---------|
| `WorkspaceLayout` | ResizablePanels grid with 8 pane types |
| `ChatPane` | Wraps ChatPanel for the collaboration pane |
| `ArtifactsPane` | File tree + upload button + drag-and-drop |
| `EditorPane` | File editor with Monaco + preview |
| `NavigationPane` | Gate timeline |
| `MetadataPane` | Crux title, slug, description, tags |
| `PublishPane` | Publish state, URL management |
| `SyncPane` | Dimension syncing (placeholder) |
| `ExportPane` | Export crux as ZIP |
| `EditorContent` | Monaco editor instance, save on Cmd+S |
| `EditorTabBar` | Open file tabs with close/switch |
| `EditorToolbar` | View mode toggle (source/preview) |
| `PaneHeader` | Shared header component for panes |
| `ContextMenu` | Right-click menu for file tree |
| `DragContext` | Pane drag-to-reorder context |
| `InlineRename` | Inline file rename input |
| `MobilePaneSwitcher` | Single-pane selector for mobile |

### `components/chat/`

| Component | Purpose |
|-----------|---------|
| `ChatPanel` | Main conversation container |
| `MessageList` | Scrollable message history |
| `MessageBubble` | Individual message with markdown + tool calls |
| `MessageInput` | Auto-growing textarea with send button |
| `MarkdownRenderer` | react-markdown with syntax highlighting |
| `ModelSelector` | Claude model dropdown |
| `PublishButton` | Publish trigger in chat header |
| `PublishModal` | Confirm publish with visibility options |

### `components/artifacts/`

| Component | Purpose |
|-----------|---------|
| `ArboristFileTree` | react-arborist tree with drag-drop, rename |
| `FileTabs` | Tab bar for open files |
| `FileContent` | Content display (code/image) |
| `FileViewer` | Container for file browsing |
| `fileIcons` | Icon mappings by file extension |
| `treeData` | Convert flat attachments to tree nodes |

### `components/display/`

| Component | Purpose |
|-----------|---------|
| `ArtifactRenderer` | Render published HTML/markdown/images |
| `HistoryViewer` | Conversation history on published crux |
| `PublicTopBar` | Header for public display mode |

### `components/auth/`

| Component | Purpose |
|-----------|---------|
| `AuthGuard` | Route protection layout wrapper |
| `LoginForm` | Email code auth flow |
| `UserMenu` | Profile dropdown with settings & logout |

### `components/ui/`

Reusable primitives: `Button`, `IconButton`, `Input`, `Toggle`, `Modal`, `Panel`, `Spinner`, `Badge`, `ErrorBoundary`, `ApiKeySetup`.

---

## 13. Data Flow Diagrams

### Create a crux and chat

```
Garden page
  → "New Crux" button
  → cruxStore.createCrux()
    → generates slug: title + base36 timestamp
    → POST /cruxes {slug, title, type: "workspace", meta: {messages, settings}}
    → navigate to /c/{id}

Crux page mounts
  → loadCrux(id)        → GET /cruxes/{id} + GET /cruxes/{id}/attachments
  → setActiveCrux(id)   → restore layout/tabs/folders from localStorage

User types message
  → useChat.send(content)
  → addMessage({role: "user", content})
  → buildApiMessages() → Anthropic-compatible history
  → streamChat() → POST /ai/chat (SSE)
    → text events → appendStreamContent() → live rendering
    → tool_start → track tool calls
    → tool_result → refresh artifacts from server
    → done → addMessage({role: "assistant", ...})
  → saveMeta() → PATCH /cruxes/{id} with updated messages

If AI wrote files
  → setPendingGateCreation(true)
  → useGates detects pending + !streaming
  → createGate()
    → AI generates snapshot
    → POST /cruxes (gate crux)
    → POST /cruxes/{id}/dimensions (gate link)
    → AI generates updated summary
    → PATCH /cruxes/{id} with summary + gateCount
```

### Publish and view

```
User clicks Publish
  → cruxStore.publishCrux()
  → saveMeta()
  → POST /cruxes/{id}/publish
  → hasUnpublishedChanges = false

Visitor navigates to /@username/slug
  → PublicCrux page
  → GET /public/authors/{username}/cruxes/{slug}
  → GET /public/authors/{username}/cruxes/{slug}/attachments
  → ArtifactRenderer: detect content type
    → HTML → srcdoc iframe with rewritten URLs
    → Markdown → react-markdown render
    → Image → photo viewer
  → HistoryViewer: show conversation history
```

---

## 14. localStorage Keys

| Key | Purpose | Scope |
|-----|---------|-------|
| `cruxgarden:accessToken` | JWT access token | Auth |
| `cruxgarden:refreshToken` | JWT refresh token | Auth |
| `cruxgarden:theme` | dark/light/auto | Theme |
| `cruxgarden:anthropicApiKey` | User's own API key (BYOK) | AI |
| `cruxgarden:layout:global` | Default pane arrangement | Layout |
| `cruxgarden:layout:{cruxId}` | Per-crux pane layout | Layout |
| `cruxgarden:editor-tabs:{cruxId}` | Open editor tabs per crux | Editor |
| `cruxgarden:folder-state:{cruxId}` | Tree folder expand/collapse | Editor |

---

## 15. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 19 | UI framework |
| `react-dom` | 19 | DOM rendering |
| `react-router` + `react-router-dom` | 7 | Client-side routing |
| `zustand` | 5 | State management |
| `axios` | 1.7 | HTTP client (REST API) |
| `@monaco-editor/react` | 4.7 | Code editor |
| `react-resizable-panels` | 4.6 | Pane layout system |
| `react-arborist` | 3.4 | File tree with drag-drop |
| `react-markdown` | 10.1 | Markdown rendering |
| `remark-gfm` | 4.0 | GitHub Flavored Markdown |
| `rehype-highlight` | 7.0 | Syntax highlighting in markdown |
| `react-photo-view` | 1.2 | Image lightbox |
| `jszip` | 3.10 | ZIP import/export |
| `clsx` | 2.1 | Conditional class names |
| `tailwind-merge` | 2.6 | Deduplicate Tailwind classes |
| `tailwindcss` | 4.0 | CSS framework |
| `vite` | 6.0 | Build tool + dev server |
| `typescript` | 5.7 | Type system |

---

## 16. Build & Dev

```bash
npm run dev           # Vite dev server on port 8080
npm run build         # TypeScript check + Vite production build → dist/
npm run preview       # Serve production build on port 8080
npm run lint          # ESLint
npm run format        # Prettier
npm run format:check  # Prettier dry run
```

Path alias: `@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.json`).

The Docker build (`docker/Dockerfile`) produces static files served by nginx.
