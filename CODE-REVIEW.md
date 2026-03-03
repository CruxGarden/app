# Code Review — Crux Garden App

**Date:** 2026-03-02
**Scope:** Full architecture and code review of `app/src/` — stores, hooks, API layer, components, pages, lib, styles, and config files.

---

## Executive Summary

The codebase is well-structured with clear separation between stores, hooks, API, and components. The overall architecture (Zustand stores, SSE streaming, service worker previews, 8-pane workspace) is sound. However, there are several categories of issues that should be addressed before launch:

| Severity | Count | Description |
| -------- | ----- | ----------- |
| **Critical** | 4 | Broken event handler, React key bugs, Fragment key missing |
| **Moderate** | 38 | Race conditions, stale closures, missing error handling, security, dead code systems, type safety |
| **Minor** | 50+ | Console statements, dead exports, naming inconsistency, accessibility, hardcoded values |
| **Style** | 15+ | Duplicated utilities, naming conventions, redundant config |

---

## Critical Issues

### C1. `node.handleClick` never called — tree clicks broken

**File:** `src/components/artifacts/ArboristFileTree.tsx:130`

```tsx
onClick={() => node.handleClick}
```

The function reference is evaluated but **never invoked**. Should be `onClick={() => node.handleClick()}` or `onClick={node.handleClick}`. Single-click selection in the file tree is broken. The `onActivate` callback compensates for double-click/enter, but click-to-select does nothing.

### C2. Index used as React key in message lists

**File:** `src/components/chat/MessageList.tsx:36`

```tsx
{messages.map((msg, i) => (
  <MessageBubble key={i} message={msg} ... />
))}
```

Messages can be reordered or deleted. Index keys cause incorrect reconciliation — wrong content rendered in wrong bubbles. Use a stable message ID.

Same issue in `src/components/display/HistoryViewer.tsx:79` and `src/components/keeper/KeeperConsole.tsx:367`.

### C3. Missing Fragment key in palette table

**File:** `src/components/settings/MoodSettings.tsx:226-228`

```tsx
{PALETTE_GROUPS.map((group) => (
  <>
    <tr key={`h-${group.label}`}>
```

The `<>` fragment has no `key`. The key is on the inner `<tr>` but React needs it on the outermost element in a `.map()`. Produces a React warning and potential rendering issues. Should be `<Fragment key={group.label}>`.

### C4. Legacy Zustand getters break with `set()` (currently inert)

**File:** `src/stores/uiStore.ts:571-577`

```tsx
get fileViewerOpen() {
  return get().paneVisibility.artifacts || get().paneVisibility.workshop;
},
```

JavaScript getters on the initial state object are evaluated and frozen as static values by Zustand's `set()` (which uses `Object.assign`). After any state update, these become stale booleans. **Currently inert** because no component uses these legacy properties, but they should be removed to prevent future bugs.

---

## Stores

### S1. No loading/error state for `cruxStore` async operations

**File:** `src/stores/cruxStore.ts`
**Severity:** Moderate

`loadCrux`, `publishCrux`, `createFile`, `uploadFile`, `deleteArtifact`, `saveArtifactContent` are all async with no loading indicators or error state. `gardenStore` has `loading: boolean` and `authStore` has `isLoading`, but `cruxStore` has neither. Components must manage their own loading/error state, which they don't do consistently.

### S2. `loadCrux` does not reset state before loading

**File:** `src/stores/cruxStore.ts:93-122`
**Severity:** Moderate

When navigating between cruxes, if the API call fails, the store retains state from the previous crux. The `Crux.tsx` page calls `reset()` in cleanup, but there's a window where old state is visible with a new crux ID.

### S3. `deleteArtifact` vs `confirmDelete` inconsistency

**File:** `src/stores/cruxStore.ts:362-371` vs `418-427`
**Severity:** Moderate

Two methods delete attachments with different strategies:
- `deleteArtifact`: optimistic local removal, sets `hasUnpublishedChanges`, closes editor tab via dynamic import
- `confirmDelete`: re-fetches all attachments, does NOT set `hasUnpublishedChanges`, does NOT close editor tab

### S4. `setPalette` does not persist to server

**File:** `src/stores/cruxStore.ts:217-223`
**Severity:** Moderate

Unlike `setModel` which calls `saveMeta()`, `setPalette` only updates local state. Palette changes are lost on page refresh unless something else triggers `saveMeta`.

### S5. Client-side filtering defeats server-side pagination

**File:** `src/stores/gardenStore.ts:34-52`
**Severity:** Moderate

`DEFAULT_LIMIT` is 1000, fetching all cruxes in one request. Client-side filter/sort then overrides server pagination metadata. If a user has more than 1000 cruxes, search misses results. Race condition: rapid typing can cause out-of-order load results.

### S6. Dynamic import creates lazy circular dependency

**File:** `src/stores/cruxStore.ts:369-370`
**Severity:** Moderate

```tsx
const { useUIStore } = await import('@/stores/uiStore');
useUIStore.getState().closeTab(id);
```

Unusual pattern that introduces an async gap between deleting an artifact and closing its tab. Better handled by the calling component or a store subscription.

### S7. `console.error` left in gardenStore

**File:** `src/stores/gardenStore.ts:54`
**Severity:** Minor

Only `console.*` statement across all five stores. Error is silently swallowed — UI shows an empty list with no feedback.

### S8. Hardcoded model name

**File:** `src/stores/cruxStore.ts:155`
**Severity:** Minor

```tsx
model: 'claude-sonnet-4-20250514',
```

Model ID is also hardcoded in `ChatPanel.tsx`, `KeeperConsole.tsx`, `MetadataContent.tsx`, `Garden.tsx`, and `ModelSelector.tsx`. Should be a shared constant.

### S9. No `matchMedia` listener for auto theme

**File:** `src/stores/themeStore.ts`
**Severity:** Minor

When `mode === 'auto'`, the resolved theme is determined once. If the user's OS switches between light and dark mode, the app won't update until page refresh.

### S10. Legacy compatibility code is dead

**File:** `src/stores/uiStore.ts:119-125, 569-604`
**Severity:** Minor

`fileViewerOpen`, `timelineOpen`, `toggleFileViewer`, `toggleTimeline`, `setFileViewer`, `setTimeline` are defined but never consumed by any component. Should be removed.

### S11. `diffTargetId` and `setDiffTarget` are unused

**File:** `src/stores/uiStore.ts:41, 98, 530`
**Severity:** Minor

Scaffolding for a future diff feature that is not yet implemented.

### S12. localStorage grows unbounded

**File:** `src/stores/uiStore.ts:173-175`
**Severity:** Minor

Three localStorage keys per crux (layout, editor tabs, folder state) with no cleanup mechanism. Heavy users could eventually hit the ~5-10MB localStorage limit.

### S13. Full-store destructuring causes unnecessary re-renders

**Severity:** Moderate

Multiple components destructure entire stores instead of using selectors:
- `useChat.ts:71-84` — destructures 11 fields from cruxStore
- `useGates.ts:140` — destructures many fields from cruxStore
- `useGarden.ts:8-9` — destructures everything from gardenStore
- `EditorPane.tsx:48` — destructures from uiStore

`cruxStore` is particularly impactful because `appendStreamContent` updates on every SSE chunk, causing many re-renders per second for subscribed components.

---

## Hooks

### H1. `console.log` logging every SSE event

**File:** `src/hooks/useChat.ts:114`
**Severity:** Moderate

```tsx
console.log('[SSE]', event.event, event.data);
```

Logs every SSE event including full file content from `tool_result` events. Hundreds of kilobytes per conversation. Performance drag and potential information leak.

### H2. No error handling for `saveMeta()` failure in useChat

**File:** `src/hooks/useChat.ts:193`
**Severity:** Moderate

If `saveMeta()` throws after messages were added locally, messages exist in memory but are not persisted. No retry, no toast, no indication of failure.

### H3. Stale closure risk with `messages` in useChat.send

**File:** `src/hooks/useChat.ts:97, 200-201`
**Severity:** Moderate

`send` closes over `messages` from the render-time snapshot. Using `useCruxStore.getState().messages` (the pattern already used in `useGates`) would be more robust and remove `messages` from the dependency array.

### H4. `useGates` effect dependency array masks real problems

**File:** `src/hooks/useGates.ts:161-162`
**Severity:** Moderate

```tsx
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [pendingGateCreation, isStreaming]);
```

The effect accesses `crux` as a guard condition but `crux` is not a dependency. If `pendingGateCreation` becomes true before `crux` loads, the effect bails out and never retries.

### H5. Stale `crux.meta` in `reconcileSummary`

**File:** `src/hooks/useGates.ts:291-293`
**Severity:** Moderate

By the time `reconcileSummary` executes (after two AI calls), `crux.meta` is stale. The spread `{ ...crux.meta, ... }` can overwrite newer meta. Should use `useCruxStore.getState().crux?.meta`.

### H6. No abort/cancellation for gate AI calls

**File:** `src/hooks/useGates.ts:180-188, 227-236`
**Severity:** Moderate

`collectStreamText` calls have no abort signal. If the component unmounts mid-gate-creation, network requests continue and state updates fire for a crux the user has left.

### H7. `findLastGateMessageEnd` always returns 0

**File:** `src/hooks/useGates.ts:260-264`
**Severity:** Moderate

Every gate snapshot includes the entire conversation history from the beginning. As conversations grow, this wastes tokens and produces unfocused snapshots.

### H8. `handleNewCrux` and `deleteCrux` have no error handling

**File:** `src/hooks/useGarden.ts:19-22, 38-43`
**Severity:** Moderate

If API calls fail, errors propagate as unhandled promise rejections. No try/catch, no user feedback, no loading state.

### H9. `collectStreamText` has no timeout

**File:** `src/hooks/useGates.ts:87-102`
**Severity:** Moderate

No `AbortSignal` accepted or forwarded. A stuck AI response blocks gate creation indefinitely.

### H10. Unsafe `as unknown as T` type casts

**File:** `src/hooks/useGates.ts:63, 81`
**Severity:** Minor

Double-cast bypasses TypeScript entirely. If the AI returns incorrectly typed values, runtime won't catch it.

### H11. `versionRef` never resets when `cruxId` changes

**File:** `src/hooks/usePreviewUrl.ts:36`
**Severity:** Minor

Could cause incomplete cache rebuild for a new crux (takes incremental-update path instead of full-cache path).

---

## API Layer

### A1. Double token refresh race condition

**File:** `src/api/client.ts:47-85` + `src/stores/authStore.ts:48-72`
**Severity:** Moderate

Two independent refresh mechanisms: the axios interceptor catches 401s and refreshes, AND `authStore.init()` manually refreshes on profile fetch failure. The interceptor refreshes first (rotating the refresh token), then `init()` tries with the old (now invalid) refresh token. Could cause auth failures on app startup.

### A2. `streamChat` bypasses axios interceptor — no auto-refresh

**File:** `src/api/ai.ts`
**Severity:** Moderate

`streamChat` uses raw `fetch` and manually attaches the bearer token. If the access token expires mid-chat, the 401 is not handled — no refresh, no retry. Chat silently fails.

### A3. SSE parser doesn't handle multi-line `data:` fields

**File:** `src/api/ai.ts:56-72`
**Severity:** Moderate

Per the SSE specification, multiple consecutive `data:` lines should be concatenated with newlines. The parser treats each `data:` line as a separate event. If the server ever sends multi-line data payloads, they are silently lost.

### A4. Malformed SSE JSON silently swallowed

**File:** `src/api/ai.ts:64-69`
**Severity:** Moderate

```tsx
try {
  const data = JSON.parse(dataStr);
  onEvent({ event: currentEvent as SSEEvent['event'], data });
} catch {
  // Skip malformed JSON
}
```

If the `error` event has malformed JSON, the client never knows an error occurred.

### A5. `data: any` in SSEEvent — no type safety for consumers

**File:** `src/api/ai.ts:5`
**Severity:** Moderate

All downstream consumers (`useChat.ts`, `useGates.ts`) access `event.data.text`, `event.data.name` without type checking. Should be a discriminated union.

### A6. Anthropic API key stored in localStorage (plaintext)

**File:** `src/api/ai.ts:25-28`
**Severity:** Moderate

The BYOK header plumbing is active even though the feature isn't launched. `localStorage` is accessible to any XSS payload. Should be documented as a known risk or removed until BYOK is implemented.

### A7. Entire `paths.ts` module is never imported

**File:** `src/api/paths.ts` (98 lines)
**Severity:** Minor

The barrel export exists in `index.ts`, but nothing imports `paths`. Entire module is dead code.

### A8. `authors.list()`, `authors.get()`, `authors.getCruxBySlug()` are never called

**File:** `src/api/authors.ts:4-30`
**Severity:** Minor

Three dead functions. Only `authors.update()`, `authors.uploadAvatar()`, `authors.removeAvatar()` are used.

### A9. Pagination parsing duplicated between `cruxes.ts` and `paths.ts`

**File:** `src/api/cruxes.ts:30-51`, `src/api/paths.ts:20-39`
**Severity:** Minor

Identical logic copy-pasted. Should be a shared utility.

### A10. Remaining buffer after SSE stream ends is dropped

**File:** `src/api/ai.ts:49-57`
**Severity:** Minor

If the server's final chunk doesn't end with `\n`, the last event is lost.

---

## Components & Pages

### P1. TODO: publish error silently swallowed

**File:** `src/components/chat/PublishButton.tsx:56`
**Severity:** Moderate

```tsx
// TODO: show error toast
```

Publish errors give the user no feedback.

### P2. Unused `importProgress` state — set but never rendered

**File:** `src/pages/Garden.tsx:147`
**Severity:** Moderate

```tsx
const [, setImportProgress] = useState('');
```

Progress text is set in multiple places but never displayed to the user.

### P3. `WorkspaceLayout` handlers not memoized

**File:** `src/components/workspace/WorkspaceLayout.tsx:126-168`
**Severity:** Moderate

Six handler functions recreated every render without `useCallback`. WorkspaceLayout re-renders frequently due to store subscriptions.

### P4. Modal missing dialog semantics

**File:** `src/components/ui/Modal.tsx:25-31`
**Severity:** Moderate

Uses `<div>` instead of `<dialog>`. No `role="dialog"`, no `aria-modal="true"`, no focus trapping. Keyboard and screen reader users cannot properly interact.

### P5. Context menu missing ARIA roles

**File:** `src/components/workspace/ContextMenu.tsx:137-159`
**Severity:** Moderate

No `role="menu"` on container, no `role="menuitem"` on items, no keyboard navigation (arrow keys).

### P6. Missing error boundaries around panes

**File:** `src/components/workspace/WorkspaceLayout.tsx`
**Severity:** Moderate

Only `EditorPane` has an error boundary. A crash in `ChatPane`, `ArtifactsPane`, `PublishPane`, or `ExportPane` takes down the entire workspace.

### P7. `formatSize` duplicated 5 times

**Files:** `FileContent.tsx`, `EditorContent.tsx`, `ArtifactRenderer.tsx`, `MetadataContent.tsx`, `ArtifactsPane.tsx`
**Severity:** Moderate

Five copies of the same function. Should be extracted to a shared utility.

### P8. `formatDate` duplicated

**Files:** `PublishPane.tsx`, `MetadataContent.tsx`
**Severity:** Minor

### P9. SVG icon components duplicated across files

**Files:** `TopBar.tsx`, `MobilePaneSwitcher.tsx`, individual pane files
**Severity:** Moderate

`PublishIcon`, `ChatIcon`, `FolderIcon`, `CodeIcon`, `TagIcon`, `SyncIcon`, `ExportIcon` are copy-pasted across multiple files. Consider a shared icon module.

### P10. `VITE_API_URL` fallback repeated instead of using centralized constant

**Files:** `MessageList.tsx:20`, `UserMenu.tsx:83`, `Settings.tsx:13`, `Garden.tsx:6`
**Severity:** Minor

```tsx
import.meta.env.VITE_API_URL || 'http://localhost:3000'
```

Should import `API_BASE_URL` from `@/api/client`.

### P11. `API_KEY_STORAGE` constant duplicated

**Files:** `ApiKeySetup.tsx:4`, `KeeperConsole.tsx:6`
**Severity:** Minor

### P12. `BG_STORAGE_KEY` constant duplicated

**Files:** `Garden.tsx`, `MoodSettings.tsx`, `AnimatedBackground.tsx`
**Severity:** Minor

### P13. `any` types in KeeperConsole

**File:** `src/components/keeper/KeeperConsole.tsx:25, 29-33, 124, 142, 292`
**Severity:** Moderate

`KEEPER_TOOLS: any[]`, `Record<string, any>`, `catch (err: any)`. Should use proper types or `unknown`.

### P14. `UserMenu` button missing `aria-label`

**File:** `src/components/auth/UserMenu.tsx:95`
**Severity:** Minor

### P15. `FlowFieldBackground` canvas missing `aria-hidden`

**File:** `src/components/layout/FlowFieldBackground.tsx:404`
**Severity:** Minor

StarfieldBackground and BloomBackground correctly set `aria-hidden`, but FlowFieldBackground does not.

### P16. `FileViewer.tsx` and `FileTree.tsx` may be dead code

**File:** `src/components/artifacts/FileViewer.tsx`, `src/components/artifacts/FileTree.tsx`
**Severity:** Minor

Likely superseded by `ArboristFileTree` + `EditorPane`.

### P17. Stale `blobUrl` in cleanup closure

**File:** `src/components/artifacts/FileContent.tsx:184`
**Severity:** Moderate

Cleanup captures `blobUrl` from render scope, not cleanup time. Could revoke an outdated URL while leaking the current one.

---

## Lib, Styles & Config

### L1. Entire URL rewriting system is unused

**File:** `src/lib/rewriteUrls.ts`
**Severity:** Moderate

`extractRelativeRefs`, `rewriteHtmlUrls`, `buildPathMap`, `resolveRef`, `resolveRelative`, `dirname` are all exported but never imported. Only `normalizePath` is used externally. The HTML URL rewriting infrastructure is either unfinished or was replaced by the service worker approach.

### L2. `DARK_PALETTE` and `LIGHT_PALETTE` are unused and out of sync

**File:** `src/lib/palette.ts:90, 146`
**Severity:** Moderate

110 lines of exported constants that are never imported. Values diverge from the CSS source of truth in `globals.css` (e.g., `surface`, `panel`, `bloomBlur` all differ). If ever used for a "reset to defaults" feature, they would produce incorrect results.

### L3. `toHex` doesn't handle modern CSS color formats

**File:** `src/lib/monacoTheme.ts:10-25`
**Severity:** Moderate

Only handles `#hex` and `rgb()`/`rgba()` comma syntax. Modern browsers increasingly return space-separated syntax (`rgb(82 96 86 / 0.18)`) which the regex doesn't match. Falls back silently to `000000` (black).

### L4. `getComputedStyle` called 15 times instead of once

**File:** `src/lib/monacoTheme.ts:4-6`
**Severity:** Minor

Each `cssVar()` call creates a new `getComputedStyle()`. Should cache the computed style in a local variable.

### L5. `highlight.js/styles/github-dark.min.css` is fully overridden

**File:** `src/styles/globals.css:3`
**Severity:** Minor

Lines 260-327 override every highlight.js token class with CSS variables. The imported theme is dead weight — adds to bundle size with zero visual effect.

### L6. `palette-transition` applies `!important` transitions to ALL elements

**File:** `src/styles/globals.css:238-249`
**Severity:** Moderate

The `*` selector with `!important` forces the browser to track transitions on every DOM element during palette changes. Causes layout/paint thrashing on complex pages.

### L7. Service worker serves cached content without CSP headers

**File:** `public/preview-sw.js:56-59`
**Severity:** Moderate

No `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options` headers on served preview content. AI-generated HTML could access the same origin's cookies and localStorage.

### L8. nginx config doesn't handle `/__preview/` paths

**File:** `docker/nginx.conf`
**Severity:** Moderate

`try_files` fallback serves `index.html` for preview paths when the service worker isn't active, causing confusing behavior instead of a clean 404.

### L9. `isImageFile` export unused

**File:** `src/lib/monacoLanguages.ts:63`
**Severity:** Minor

### L10. Unused font file

**File:** `public/fonts/Outfit-LatinExt.woff2`
**Severity:** Minor

No `@font-face` rule references this file.

### L11. No ESLint configuration despite `lint` script

**File:** `package.json:10`
**Severity:** Moderate

```json
"lint": "eslint ."
```

No `eslint.config.js` or ESLint dependencies exist. Running `npm run lint` would fail.

### L12. Source maps enabled in production

**File:** `vite.config.ts:18`
**Severity:** Minor

`sourcemap: true` exposes source code structure. Consider `sourcemap: 'hidden'` for error-tracking without public exposure.

### L13. `.env.production` committed to repository

**File:** `.env.production`
**Severity:** Minor

Currently only contains the public API URL, but `.env.*` files should generally not be tracked. The Docker build uses build args instead, making this file redundant for production.

### L14. Redundant `react-router` dependency

**File:** `package.json:25`
**Severity:** Minor

In React Router v7, `react-router-dom` re-exports everything from `react-router`. Only `react-router-dom` is needed as a direct dependency.

### L15. Port 8080 specified in two places

**File:** `vite.config.ts:14` and `package.json` dev script
**Severity:** Style

---

## Top 10 Recommendations (by impact)

### 1. Fix the broken file tree click handler (C1)
Change `onClick={() => node.handleClick}` to `onClick={() => node.handleClick()}`. One character fix, restores click-to-select in the file tree.

### 2. Remove the SSE console.log (H1)
`console.log('[SSE]', event.event, event.data)` logs hundreds of KB per conversation. Remove or gate behind a debug flag.

### 3. Fix the double token refresh race (A1)
Remove the manual refresh in `authStore.init()` — the axios interceptor already handles it. Add 401 handling to `streamChat` since it bypasses the interceptor (A2).

### 4. Add error handling to user-facing actions (S1, H2, H8, P1)
`loadCrux`, `createCrux`, `deleteCrux`, `publishCrux`, and `saveMeta` all fail silently. Add try/catch with user feedback (toast/banner) for all async operations triggered by user actions.

### 5. Use selectors instead of full-store destructuring (S13)
Replace `const { crux, messages, ... } = useCruxStore()` with individual selectors. Especially critical for components rendered during SSE streaming, which updates `streamingContent` on every chunk.

### 6. Fix React key issues (C2, C3)
Use stable IDs for message list keys. Use `<Fragment key={...}>` in MoodSettings palette table.

### 7. Remove dead code (S10, S11, A7, A8, L1, L2, P16)
Legacy store properties, unused API modules (`paths.ts`), unused API functions (`authors.list/get/getCruxBySlug`), unused URL rewriting exports, unused palette constants. ~300 lines of dead code.

### 8. Extract duplicated utilities (P7, P8, P9, P10, P11, P12, S8)
Create shared modules for: `formatSize`, `formatDate`, icon components, model ID constant, localStorage key constants, `API_BASE_URL` usage.

### 9. Add abort signals to gate creation (H6, H9)
`collectStreamText` should accept an `AbortSignal`. When the workspace unmounts, cancel in-flight gate AI calls to prevent stale writes and wasted API tokens.

### 10. Harden the SSE parser (A3, A4, A5)
Handle multi-line `data:` fields per the SSE spec. Log or surface JSON parse failures. Type the SSE events as a discriminated union instead of `data: any`.

---

## Local-First Readiness Assessment

### Current state: not abstracted for local/remote switching

The frontend has **no data access abstraction layer**. Stores, hooks, and components all import API modules directly:

| Layer | Files calling `cruxes.*` directly |
| ----- | --------------------------------- |
| Stores | `cruxStore.ts`, `gardenStore.ts` |
| Hooks | `useChat.ts`, `useGates.ts`, `useFileContent.ts`, `usePreviewUrl.ts`, `useGarden.ts` |
| Components | `EditorContent.tsx`, `ExportPane.tsx`, `CommandPalette.tsx`, `PublishButton.tsx`, `FileContent.tsx` |

To swap to Dexie (or any local persistence), every one of these ~15 import sites would need to change.

### What's good (carries over cleanly)

- **Types** — `Crux`, `Attachment`, `ChatMessage`, etc. in `types.ts` are clean data shapes, not server-coupled. They'd work as Dexie table schemas.
- **Store interfaces** — Zustand stores separate UI state from data access. The store *interfaces* (what they expose to components) wouldn't need to change — only the implementations of their async actions.
- **`cruxes.ts` surface** — The API module already resembles a repository: `list()`, `get()`, `create()`, `update()`, `remove()`, `getAttachments()`. The function signatures are what you'd want for an interface.
- **Backend repository pattern** — The NestJS API already uses `Controller → Service → Repository → Database`. The repository interfaces define the exact data access contract that the frontend local layer would need to support.

### What's not ready

1. **No repository interface** — `cruxes.ts` has the right *shape* but is not behind an interface. There's no seam to slot in an alternative implementation.
2. **AI streaming is hardcoded to the server** — `streamChat` does a raw `fetch` to `${API_BASE_URL}/ai/chat`. Client-side BYOK calls to Anthropic have a completely different request format, auth headers, and response parsing.
3. **Auth assumes a remote server** — JWT tokens, refresh interceptors, and `authStore.init()` all assume a REST API. Local-first mode either has no auth (single user) or a completely different model.
4. **File storage is server-coupled** — `uploadAttachment` sends `FormData` to the API, `downloadAttachment` fetches a blob. Local-first would store files in IndexedDB or OPFS.

### What the refactor looks like

Define a **repository interface** that both the remote API and Dexie implement:

```typescript
// src/data/repository.ts
interface CruxRepository {
  list(params?: ListParams): Promise<{ data: Crux[]; meta: PaginationMeta }>;
  get(id: string): Promise<Crux>;
  create(dto: CreateCruxDto): Promise<Crux>;
  update(id: string, dto: UpdateCruxDto): Promise<Crux>;
  remove(id: string): Promise<void>;
  getAttachments(cruxId: string): Promise<Attachment[]>;
  uploadAttachment(cruxId: string, file: File, meta?: AttachmentMeta): Promise<Attachment>;
  downloadAttachment(cruxId: string, attachmentId: string): Promise<Blob>;
  deleteAttachment(attachmentId: string): Promise<void>;
  getDimensions(cruxId: string, type?: DimensionType): Promise<Dimension[]>;
  createDimension(cruxId: string, dto: CreateDimensionDto): Promise<Dimension>;
  publish(cruxId: string): Promise<Crux>;
  unpublish(cruxId: string): Promise<Crux>;
}

// src/data/remote.ts  — wraps current API calls (nearly zero work)
// src/data/local.ts   — wraps Dexie (references backend repository queries)
```

Then a provider selects the implementation:

```typescript
const repo: CruxRepository = useLocalFirst ? new DexieRepository() : new RemoteRepository();
```

The same pattern applies to `AuthRepository` and `AIProvider` (server-proxied vs direct Anthropic calls).

### Effort breakdown

| Step | Effort | Notes |
| ---- | ------ | ----- |
| Define interfaces matching `cruxes.ts` / `auth.ts` / `ai.ts` | Low | Signatures already exist |
| Wrap existing API modules as "remote" implementation | Trivial | Function signatures already match |
| Build Dexie implementation | Medium | Reference backend Knex queries for data access patterns |
| Update ~15 import sites to use abstraction | Low | Mechanical find-and-replace |
| AI provider abstraction (server-proxied vs direct Anthropic) | High | Completely different request/response shapes |

The types, store interfaces, and UI components stay almost unchanged. The backend's existing repository pattern provides the blueprint — the design work is already done on the server side.
