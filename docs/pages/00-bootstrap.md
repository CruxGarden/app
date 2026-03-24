# Bootstrap

How the app starts, before any page renders.

## index.html

**File:** [app/index.html](../../index.html)

This is the first thing the browser loads. Everything before React exists happens here.

### Head

```html
<html lang="en" class="dark">
```

The `class="dark"` ensures dark theme CSS custom properties are active from the first paint. Without it, there'd be a white flash before React applies the theme.

```html
<link rel="preload" href="/fonts/JetBrainsMono-Medium.woff2" as="font" type="font/woff2" crossorigin />
```

Preloads the display font so it's available by the time the splash screen renders. Without this, the splash title would briefly show in the system monospace font before swapping to JetBrains Mono. The `crossorigin` attribute is required — browsers always fetch fonts in CORS mode.

### Styles

All splash screen styles live in a `<style>` block in `<head>`, not inline on elements.

**Body background:**

```css
/* #0a0c0b matches the default dark palette --bg in src/styles/globals.css (garden preset).
   Hardcoded here because CSS custom properties aren't available before globals.css loads.
   If the default --bg changes, update this value to match. */
body { margin: 0; background: #0a0c0b; }
```

The hardcoded `#0a0c0b` prevents a white flash between HTML load and CSS processing. It matches the garden preset's `--bg` value from `src/styles/globals.css`. If that default ever changes, this value needs manual updating.

**Splash layout:** Fixed overlay, centered content, hidden by default (`display: none`). Only the splash color script (below) can make it visible, and only on app routes.

**Font:** The `#splash-title` uses JetBrains Mono — the same display font used throughout the app. Defined as `@font-face` in `src/styles/globals.css`, preloaded in `<head>`.

**Spinner:** A 20px circle with one transparent border side, rotating via CSS `@keyframes spin`.

### Splash markup

```html
<div id="splash">
  <div id="splash-inner">
    <span id="splash-title">Crux Garden</span>
    <div id="splash-spinner"></div>
  </div>
</div>
```

The splash starts hidden (`display: none` from the stylesheet). It only becomes visible if the color script activates it.

### Splash color script

An inline `<script>` that runs synchronously before React loads. Its job: color the splash screen to match the user's active mood preset so the loading screen feels like part of the app.

**Why it exists:** App routes (`/home`, `/c/:id`, `/settings`) need 1-3 seconds to initialize SQLite and OPFS. Without the splash, the user sees a black screen. With the splash, they see a branded loading screen in their chosen mood colors.

**What it does, step by step:**

1. **Route check** — if the URL isn't an app route, exits immediately. Gateway and public pages don't need a splash.

2. **Preset lookup** — contains a hardcoded copy of all 30 mood presets from `lib/moods/presets.ts`, each as `[background, accent, text]` colors. This duplication is necessary because the script runs before any app module loads. If a preset is added or changed, both places need updating.

3. **Read user preference** — checks localStorage for the theme mode (`cruxgarden:theme`) and the active preset for that mode (`cruxgarden:moodPresetDark` or `cruxgarden:moodPresetLight`). Defaults to `garden` (dark) or `parchment` (light).

4. **Apply colors** — sets the preset's background on the splash and body, accent on the spinner border, and text color on the title.

5. **Show splash** — sets `display: flex`. The splash stays visible until `Shell` dismisses it after services finish initializing.

**Why inline styles for the colors (not CSS):** The colors are dynamic — they depend on which mood the user chose, stored in localStorage. CSS can't read localStorage. The `<style>` block handles static layout; the script handles dynamic color.

### React mount point

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

`#root` is where React renders. The `type="module"` script loads the app entry point. In dev mode, Vite intercepts this and transforms TypeScript on the fly. In production, it points to the bundled output.

---

## main.tsx

**File:** [app/src/main.tsx](../../src/main.tsx)

The React entry point.

### 1. Mount Bootstrap

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
```

React renders in Strict Mode (double-invokes effects in development for bug detection). The `onCaughtError` callback on `createRoot` suppresses Monaco editor disposal errors — Monaco doesn't handle Strict Mode's double-invoke cleanly.

### 2. Bootstrap — conditional initialization

Bootstrap is the first React component. It decides what to initialize based on the current route. Initialization is split across two stores:

- **`appStore.init()`** — owns the full startup sequence (SQLite, OPFS, local author, then delegates to auth)
- **`authStore.checkAuth()`** — only handles token verification, refresh, and author reconciliation

This separation keeps concerns clean: `appStore` = "is the app ready?", `authStore` = "who is the user?"

**App routes** (`/home`, `/c/:id`, `/settings`):

- Calls `appStore.init()` which:
  1. Initializes SQLite + OPFS via `initServices()` (which also loads settings)
  2. Creates a local anonymous author via `ensureLocalAuthor()`
  3. Sets the local author on `authStore`
  4. Calls `authStore.checkAuth()` — checks stored JWT tokens, refreshes if expired, reconciles author IDs
- Returns `null` until init completes — nothing renders
- Once init finishes, `<App />` renders
- The splash screen stays visible until `Shell` dismisses it after services are fully ready

**Public routes** (`/:username/:slug`, `/:username`, `/explore`):

- Renders `<App />` immediately (no waiting)
- Kicks off `appStore.init({ lightweight: true })` in the background — skips SQLite/OPFS, just calls `authStore.checkAuth()` for token refresh
- This ensures the `crux:session` postMessage handshake has a fresh token when the published iframe loads

**Gateway** (`/`):

- Renders `<App />` immediately
- No initialization at all

### 3. Preview service worker

Runs in parallel with everything else:

```tsx
if (import.meta.env.VITE_PREVIEW_ORIGIN) {
  // Cross-origin: load hidden receiver iframe on preview.crux.garden
  import('@/lib/previewCache').then(({ initPreviewReceiver }) => initPreviewReceiver());
} else if ('serviceWorker' in navigator) {
  // Same-origin: register local service worker (dev mode fallback)
  navigator.serviceWorker.register('/preview-sw.js');
}
```

**Cross-origin** (production): A hidden iframe on `preview.crux.garden` is loaded. It registers its own service worker, providing storage isolation between the app and preview content.

**Same-origin** (local dev): Registers `preview-sw.js` on the app's origin. Simpler, no isolation.

The service worker intercepts `/__preview/{cruxId}/...` URLs and serves cached artifact files from the Cache API. This is how the HTML preview iframe works in the workshop.

### Monaco error suppression

Two global listeners suppress async errors from Monaco editor's disposal process. Monaco throws errors about `domNode`, `setClassName`, and `disposed` via `setTimeout`/`requestAnimationFrame` after the editor unmounts. These are harmless but noisy. The filter checks both the error message and the source filename to avoid suppressing real errors.

---

## App.tsx

**File:** [app/src/App.tsx](../../src/App.tsx)

Once Bootstrap renders `<App />`, this component creates the router, mounts the animated background, and renders the matched page.

### AnimatedBackground

`<AnimatedBackground />` renders behind every route — Gateway, Home Garden, Crux Builder, public pages, everything. It lives in `App.tsx` so all pages share the same background.

On first load, it defaults to `bloom`. The user can change it via the mood system, which sets the `--background-type` CSS custom property. The component reads this property and renders the matching background: `bloom`, `flowfield`, `drift`, `starfield`, `blank`, or `image`. The choice is persisted to settings (`cruxgarden:backgroundType`) so it survives page reloads.

### Lazy loading

All page components use `React.lazy()`:

```tsx
const Gateway = lazy(() => import('@/pages/Gateway'));
const HomeGarden = lazy(() => import('@/pages/HomeGarden'));
const CruxBuilder = lazy(() => import('@/pages/CruxBuilder'));
```

Page code is only downloaded when the user navigates to that route. The initial bundle contains just the bootstrap, router, and the matched page.

### Routes

React Router v7 with `createBrowserRouter`. Two groups:

**Public** (no auth required):

- `/` → Gateway
- `/explore` → Explore
- `/:username/:slug/*` → Public Crux (wildcard for SPA sub-routes)
- `/:username` → Public Garden

**App** (wrapped in `Shell`):

- `/home` → Home Garden
- `/c/:id` → Crux Builder
- `/settings` → Settings

**Catch-all:**

- `*` → NotFound

### Shell

App routes are nested inside `<Shell />`, which provides the persistent chrome:

- TopBar (header with pane toggles, user menu)
- Command Palette (`Cmd+K`)
- Keeper Console (`Escape`)
- Mood editor panel
- Service initialization + splash dismissal

### Basename

```tsx
const basename = window.__CRUX_BASENAME__ || '/';
```

`__CRUX_BASENAME__` is set by the publish injection system when the app runs inside a preview iframe or published subdomain. For normal app usage, it's `/`.

### Error boundaries

Every route is wrapped in `<ErrorBoundary>`, and the entire router is wrapped in another. If a page throws, the boundary catches it and shows a recovery UI instead of crashing the app.

---

## Summary: load sequence

| Step | What | Where |
| ---- | ---- | ----- |
| 1 | Browser loads HTML, `class="dark"` applied | index.html |
| 2 | JetBrains Mono font preload starts | index.html `<head>` |
| 3 | Body background set to `#0a0c0b` | index.html `<style>` |
| 4 | Splash color script runs (app routes only) — reads mood from localStorage, applies colors, shows splash | index.html `<script>` |
| 5 | Vite loads main.tsx | index.html `<script type="module">` |
| 6 | React mounts `<Bootstrap />` in StrictMode | main.tsx |
| 7 | Bootstrap checks route type, calls `appStore.init()` accordingly | main.tsx |
| 8 | Preview service worker registers in parallel | main.tsx |
| 9 | `<App />` renders, router matches URL to page | App.tsx |
| 10 | Matched page component lazy-loads and renders | App.tsx |
| 11 | (App routes only) Shell dismisses splash after services ready | Shell.tsx |

**Next:** [01-gateway.md](01-gateway.md)
