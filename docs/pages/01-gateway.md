# Gateway

**Route:** `/`
**File:** [app/src/pages/Gateway.tsx](../../src/pages/Gateway.tsx)

The first page a visitor sees. It's a multi-step wizard that determines how the user enters the app.

## How it works

The Gateway is a state machine with these steps:

```
banner → checking → choose → setup    → /home
                           → cloud    → /home
                           → import   → /home
                           → creating → /home
```

Every path ends at `/home` (the Home Garden).

## Step: Banner

The initial view. Shows the app name ("Crux Garden"), tagline ("where ideas grow"), and a single enter button.

When the user clicks enter:

1. Initializes SQLite + OPFS if not already ready (`initServices()`)
2. Checks if a local author already exists (looks for `cruxgarden:localAuthorId` in the `settings` table)
3. **If an author exists** → skips the wizard entirely, navigates straight to `/home`. This is the returning user path — they've already set up their garden
4. **If no author exists** → shows the Choose step. This is the first-time user path

## Step: Choose

Three options:

**Start a new garden** → goes to Setup step. For first-time users starting fresh.

**Sign in & pull from cloud** → goes to Cloud step. For users who have an existing account on another device and want to restore their garden.

**Import from file** → goes to Import step. For users restoring from a `.garden` backup file.

## Step: Setup

The onboarding form for new users. Three sections:

**Username** — optional. If left blank, a random username is generated (`wanderer-{shortId}`). Validated for alphanumeric + hyphens + underscores.

**Connect to crux.garden** — optional inline email + code form. Lets the user connect their account during setup rather than later in Settings. Enables sync and sharing immediately.

**AI Keys** — uses the `<ApiKeySetup>` component. The user can paste their Anthropic/OpenAI/Google API key. Keys stay in the browser (localStorage). This is how BYOK works — without a key, the AI features don't function.

When the user clicks "Welcome":

1. Initializes services if needed
2. Creates the local author via `ensureLocalAuthor()`
3. Updates the username if one was provided
4. Navigates to `/home`

## Step: Cloud

For returning users on a new device. Two phases:

**Phase 1: Sign in** — email + code flow (same as Settings connect). Once authenticated, checks if a garden backup exists in the cloud.

**Phase 2: Pull** — downloads the `.garden` ZIP from the API (`syncApi.pullGarden()`), imports it via `importGarden()`, creates the local author, and redirects to `/home`.

**If no cloud garden exists** — shows a message explaining the user needs to push from another device first, with a back button.

## Step: Import

For users restoring from a local backup file.

**Drag and drop** — a drop zone accepts `.garden` files. Also has a file picker button.

**On file selected:**

1. Initializes services if needed
2. Calls `importGarden()` which replaces the entire local SQLite database
3. Creates the local author
4. Redirects to `/home` via `window.location.href` (full page reload to clear stale in-memory state)

## Data created

| What | Where | When |
| ---- | ----- | ---- |
| Local author | SQLite `authors` table | Setup step (ensureLocalAuthor) |
| Author ID setting | SQLite `settings` table (`cruxgarden:localAuthorId`) | Setup step |
| Home space | SQLite `authors.home_id` | Setup step (auto-created with author) |
| API keys | localStorage (`cruxgarden:apiKey:{provider}`) | Setup step (ApiKeySetup) |
| Auth tokens | localStorage (`cruxgarden:accessToken/refreshToken`) | Cloud step or Setup connect |
| Full database | SQLite (all tables) | Import step (replaces everything) |

## What's not here

- No splash screen — the Gateway renders immediately (no SQLite init needed until the user clicks enter)
- No Shell — the Gateway is a public route, not wrapped in Shell
- No sidebar, TopBar, or pane system — just a centered card UI

## Code note

The Setup and Cloud steps have their own inline email + code connect forms. These duplicate the logic in `ConnectAccount.tsx` (the reusable component extracted from AccountSettings). A future cleanup should replace the inline forms with `<ConnectAccount />`.

**Next:** [02-shell.md](02-shell.md)
