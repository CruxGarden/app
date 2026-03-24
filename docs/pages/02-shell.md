# Shell

**File:** [app/src/components/layout/Shell.tsx](../../src/components/layout/Shell.tsx)

The Shell wraps all authenticated app routes (`/home`, `/c/:id`, `/settings`). It provides the persistent chrome — TopBar, global overlays, keyboard shortcuts — and ensures services are initialized before rendering child pages.

## Layout

```text
┌──────────────────────────────────────────┐
│  TopBar                           z-20   │
├──────────────────────────────────────────┤
│                                          │
│  <Outlet />  (HomeGarden, CruxBuilder,   │  z-10
│               Settings)                  │
│                                          │
├──────────────────────────────────────────┤
│  KeeperConsole   (overlay, conditional)  │
│  MoodBar         (side panel, conditional)│
└──────────────────────────────────────────┘
```

The Shell is a flex column filling the viewport (`h-screen`). TopBar is fixed at the top. The main content area (`<Outlet />`) takes the remaining space and scrolls independently.

## Initialization

When Shell mounts, it runs a service initialization sequence:

1. **`initServices()`** — opens the SQLite connection and OPFS blob storage. Usually already done by Bootstrap, so this returns immediately
2. **`useMoodStore.loadMoods()`** — loads custom mood cruxes from SQLite (not awaited — runs in background)
3. **`seedTutorialCrux()`** — creates the tutorial crux if it doesn't exist (not awaited — runs in background)
4. **`setServicesOk(true)`** — enables rendering of child routes via `<Outlet />`
5. **Dismiss splash** — fades out and removes the HTML `#splash` element

Until `servicesOk` is true, the Shell renders nothing in the content area (just the TopBar). This prevents child pages from accessing SQLite before it's ready.

## Module-level initialization

Before Shell even mounts, the module import triggers `applySavedMoodSettings()`. This reads the mood palette from localStorage (synchronous) and applies CSS custom properties to the document. It runs at import time so the first React paint already has the correct colors — no flash.

## Components

### TopBar

**File:** [app/src/components/layout/TopBar.tsx](../../src/components/layout/TopBar.tsx)

The persistent header bar. Contains:

- **Home button** — "Crux Garden" text, navigates to `/home`
- **Pane toggles** — only visible on `/c/:id` routes. Buttons for each workspace pane (Chat, Artifacts, Workshop, History, etc.) that toggle visibility in the mosaic layout
- **Keeper avatar** — opens the Keeper Console
- **User menu** — dropdown with username, avatar, theme toggle (dark/light), Settings link, Mood editor toggle, logout

### Keeper Console

**File:** [app/src/components/keeper/KeeperConsole.tsx](../../src/components/keeper/KeeperConsole.tsx)

A global AI chat overlay. Opened via `Escape` key (when no other overlay is open). Has its own model selector, conversation history, and the Keeper pixel avatar.

The Keeper is separate from the per-crux chat — it's a general-purpose assistant that doesn't have access to crux artifacts or tools. Conversations are stored in SQLite settings (`SettingsKey.KeeperConversations`).

### Mood Editor Panel

**File:** [app/src/components/mood/MoodEditorPanel.tsx](../../src/components/mood/MoodEditorPanel.tsx)

A side panel opened via the user menu. Three tabs:

- **Palette** — preset mood thumbnails (15 dark, 15 light). Click to apply. Active preset is highlighted
- **Background** — background type selector (Blank, Drift, Flow, Bloom) with preview thumbnails
- **Persona** — AI persona name and system prompt override for the crux chat

Changes are applied immediately (CSS custom properties for palette, `AnimatedBackground` component for background). Selections are persisted to SQLite settings.

## Keyboard shortcuts

| Shortcut | Action | Condition |
| -------- | ------ | --------- |
| `Escape` | Open Keeper Console | When Keeper is not open |
| `Escape` | Close Keeper Console | When Keeper is open (handled by Keeper's own capture-phase listener) |

## Data flow

The Shell itself doesn't create or modify data. It orchestrates:

- **Reads** from `uiStore` (keeperOpen, moodEditorOpen, pane visibility)
- **Writes** to `uiStore` (toggle states)
- **Delegates** to child routes via `<Outlet />`

## What's not here

- No routing logic — the Shell just renders `<Outlet />`, React Router handles which page appears
- No crux-specific state — that lives in `cruxStore`, managed by the CruxBuilder page
- No auth checks — the Shell renders for any user (authenticated or anonymous)

**Previous:** [01-gateway.md](01-gateway.md)
**Next:** [03-home-garden.md](03-home-garden.md)
