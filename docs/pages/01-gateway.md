# Gateway

**Route:** `/`
**File:** [app/src/pages/Gateway.tsx](../../src/pages/Gateway.tsx)

The first page a visitor sees. A multi-step wizard that determines how the user enters the app.

## How it works

The Gateway is a state machine with these steps:

```
banner → checking → choose → setup    → /home
                           → cloud    → /home
                           → import   → /home
```

Every path ends at `/home` (the Home Garden). There is no way to return to the Banner from Choose — the Banner is a one-time entry point.

## Step: Banner

The initial view. Shows the app name ("Crux Garden"), tagline ("where ideas grow"), and a single enter button.

When the user clicks enter:

1. Initializes SQLite + OPFS (`initServices()`) — this is the only place in the Gateway that calls `initServices`
2. Checks if a local author already exists (looks for `cruxgarden:localAuthorId` in the `settings` table)
3. **If an author exists** → skips the wizard entirely, navigates straight to `/home`. This is the returning user path
4. **If no author exists** → shows the Choose step. This is the first-time user path

## Step: Choose

Three options:

**Plant a new garden** → goes to Setup step. For first-time users starting fresh.

**Log in and restore from crux.garden** → goes to Cloud step. For users who have an existing crux.garden account on another device and want to restore their garden.

**Restore from .garden file** → goes to Import step. For users restoring from a `.garden` backup file.

## Step: Setup

The onboarding form for new users. An accordion UI with four collapsible sections (only one open at a time):

**Pick Username** — required. Minimum 3 characters, alphanumeric + hyphens + underscores. Validates format on every keystroke. If connected to a crux.garden account, checks API availability with a 400ms debounce. If the API account already has a username, it's adopted automatically on connect. On disconnect, API-specific errors ("taken at crux.garden") are cleared. Summary shows the entered username or "Required" (in red). Username turns red when there's a validation error.

**Upload Avatar** — optional. Uses the shared `<AvatarUpload>` component. Avatar is stored in OPFS as a content-addressable blob (SHA-256 fingerprint in `author.meta.avatarFingerprint`). Summary shows "Uploaded" or "Optional".

**Configure AI Tools** — optional. Has an "Enable AI" toggle (persisted to `SettingsKey.AiEnabled`). When enabled, shows `<ApiKeySetup>` for adding Anthropic/OpenAI/Google API keys. Keys stay in the browser (localStorage). Summary shows "Disabled", "Configured", or "Optional". Rechecks key presence when the section is toggled.

**Connect to crux.garden** — optional. Uses the shared `<ConnectAccount>` component (email + code flow). Enables storage, sync, and share features. On connect, if the API account has an existing username, it replaces the local one. If the local username conflicts with an existing API username, the error is shown and the username section reopens. On disconnect, clears API-specific validation errors. Summary shows "Connected" or "Optional".

When the user clicks "Welcome" (disabled until username is filled and has no errors):

1. Runs final format + API validation
2. Creates the local author via `ensureAuthor()`
3. Updates the username if one was provided
4. Navigates to `/home`

## Step: Cloud

For returning users on a new device. Two phases:

**Phase 1: Log in** — `<ConnectAccount>` component. Once authenticated, shows the connected email and the restore button.

**Phase 2: Restore** — downloads the `.garden` ZIP from the API (`syncApi.pullGarden()`), imports it via `importGarden()`, ensures the local author is loaded from the imported database, and redirects to `/home` via `window.location.href` (full page reload to clear stale in-memory state).

**If no cloud garden exists** — shows a message explaining the user needs to push from another device first, with a "Back to options" button.

## Step: Import

For users restoring from a local backup file.

**Drag and drop** — a drop zone accepts `.garden` files. Validates file extension on drop — non-`.garden` files show an error without attempting import. Also has a file picker button (HTML `accept=".garden"`).

**On file selected:**

1. Calls `importGarden()` which replaces the entire local SQLite database and restores OPFS blobs
2. Ensures the local author is loaded from the imported database
3. Redirects to `/home` via `window.location.href` (full page reload to clear stale in-memory state)

## Data created

| What | Where | When |
| ---- | ----- | ---- |
| Local author | SQLite `authors` table | Setup step (ensureAuthor) |
| Author ID setting | SQLite `settings` table (`cruxgarden:localAuthorId`) | Setup step |
| Home space | SQLite `authors.home_id` | Setup step (auto-created with author) |
| Avatar blob | OPFS `blobs/{fingerprint}` | Setup step (AvatarUpload) |
| AI enabled flag | SQLite `settings` table (`cruxgarden:aiEnabled`) | Setup step (AI toggle) |
| API keys | localStorage (`cruxgarden:apiKey:{provider}`) | Setup step (ApiKeySetup) |
| Auth tokens | localStorage (`cruxgarden:accessToken/refreshToken`) | Cloud step or Setup connect |
| Full database + blobs | SQLite (all tables) + OPFS | Import step (replaces everything) |

## Credential separation

API keys and auth tokens live in localStorage, not SQLite. This means:

- **Garden exports** never contain credentials — the `.garden` file is safe to share or back up
- **Garden imports** don't overwrite credentials — your keys and connection survive a restore
- No stripping or stashing logic needed during export/import

## What's not here

- No splash screen — the Gateway renders immediately (no SQLite init needed until the user clicks enter)
- No Shell — the Gateway is a public route, not wrapped in Shell
- No sidebar, TopBar, or pane system — just a centered card UI
- Setup progress is not persisted — closing the tab loses the entered username (avatar survives in OPFS)

**Next:** [02-shell.md](02-shell.md)
