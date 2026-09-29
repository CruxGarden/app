# Contributing to Crux Garden (app)

Thanks for helping. This repo is the desktop app (Electron) and the web app it wraps.

## Ground rules

- Be kind; see `CODE_OF_CONDUCT.md`.
- Security issues go to keeper@crux.garden, not to a public issue (`SECURITY.md`).
- Vocabulary matters: use the glossary terms (Crux, Artifact, Collaboration, Growth, Mood, Project
  Folder, Publish, Plan). The glossary (`CONTEXT.md`) and the Architecture Decision Records
  (`docs/adr/0001-…` onwards) live one directory above this repo in the Crux Garden workspace
  checkout, not in this repository and not (yet) at a public URL — ask if you need a copy. Propose
  a new ADR rather than silently reversing one.

## Setup

The desktop runtime is Electron 44 and requires macOS 13 or later on Mac.
Use Node 22.12 or later for development (the repository's `.nvmrc` selects Node 22).

```bash
nvm use                      # the version in .nvmrc
npm install && npm run dev   # web app on :8080
cd electron && npm install && npm run dev   # desktop shell against the dev server
```

## The one gate

`npm run verify` in `./` and in `./electron` is the definition of green: typecheck, lint, tests,
build. UI behaviour is covered by Playwright against the real desktop app:

```bash
cd electron && npm run build:all && npm run test:e2e
```

Tests run isolated from your real garden (throwaway userData + garden root). A mock API
(`e2e/api-mock.ts`) and a scripted model (`CRUX_AI_MOCK=1`) mean no accounts or keys are needed.

The named desktop gate (`npm run test:e2e -- --project=gate` in `electron/`) includes
workspace permission tests. They use Chromium's fake camera and mocked display sources;
keep them independent of real hardware, OS privacy settings and desktop capture. Consent,
origin refusal and browser cancellation must be checked through real Electron requests as well
as source-picker checks: Electron's callback behavior differs from its TypeScript declaration.

## Dependency updates

Run full `npm audit` checks in both this directory and `electron/`, then run their gates and
the affected desktop journeys. `npm audit --omit=dev` is useful for triage, but misses Electron
and Monaco: both are declared as development dependencies and ship in the app. Audit bundled
tools separately as well. A clean audit alone does not establish release readiness. Commit
both package manifests and lockfiles.

Keep Electron on a supported stable major: npm audit does not check Chromium's support
window. Electron 42+ downloads its binary on first CLI use; this repository's desktop
`postinstall` explicitly downloads it before rebuilding native dependencies, so Playwright
also works after a clean install. If you install with `--ignore-scripts`, run
`npm run postinstall` in `electron/` before testing. After a runtime update, verify the
database-owner/restart, permission, PDF and video journeys with the new binary.

macOS recording also needs the camera/audio entitlements and purpose strings in the
packaging configuration. These allow the signed app to request OS consent; they do not
replace the workspace permission policy. Fake-device tests do not verify real hardware or
the OS privacy dialogs.

The code editor and its language workers are bundled through `src/lib/monaco-editor.ts`.
Keep that loader local: the React wrapper's default downloads its own Monaco version from a
CDN, independently of the package lock. The desktop gate checks offline editing, history,
undo and JSON validation against the real bundled editor.

Mosaic 6 has a repository patch applied by `postinstall`. Its scoped UUID override uses UUID 11's
compatible CommonJS `v4()` API, the only UUID API Mosaic calls. This updates the dependency
without changing persisted panel layouts; Mosaic 7 changes the layout tree and needs a separate
migration. Keep the patch applied after dependency installs, including `npm run postinstall` if
you used `--ignore-scripts`. Panel and keyboard desktop journeys cover this integration.

## Pull requests

- Branch from `main`; one coherent change per PR; include tests for behaviour you add.
- Format with Prettier before you push: `npm run format` (CI checks `npm run format:check`). There
  is no commit hook in this repo; the Claude Code hook that formats agents' edits does not apply to
  you. ESLint runs with `--max-warnings=0`.
- Say what you verified. If a step was skipped, say that.

## What the app sends over the network (trust statement)

AI requests go from the user's machine to the provider they chose with their own key (or a local
model). Publishing and sync send only what the user asked to publish or back up, to crux.garden.
Update checks ask GitHub Releases for the latest version and can be turned off. There are no
analytics and no crash reporting unless the user opts in; logs stay on disk. Changing this stance
is a product decision (ADR 0008) — not a PR.
