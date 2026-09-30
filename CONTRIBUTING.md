# Contributing to Crux Garden (app)

Thanks for helping. This repo is the desktop app (Electron) and the web app it wraps.

## Ground rules

- Be kind; see `CODE_OF_CONDUCT.md`.
- Security issues go to keeper@crux.garden, not to a public issue (`SECURITY.md`).
- Vocabulary matters: use the glossary terms (Crux, Artifact, Collaboration, Growth, Mood, Project
  Folder, Publish, Plan). The glossary (`NEXT-AGENT-HANDOFF.md`) and the Architecture Decision Records
  (`docs/adr/0001-…` onwards) live one directory above this repo in the Crux Garden workspace
  checkout, not in this repository and not (yet) at a public URL — ask if you need a copy. Propose
  a new ADR rather than silently reversing one.

## Setup

The desktop runtime is Electron 44 and requires macOS 13 or later on Mac.
Use Node 22.12 or later for development (the repository's `.nvmrc` selects Node 22).

```bash
nvm use                      # the version in .nvmrc
npm ci && npm run dev   # web app on :8080
cd electron && nvm use && npm ci && npm run dev   # desktop shell against the dev server
```

The app repository is sufficient to install the desktop: its pinned local API package
is committed under `electron/vendor/`, with provenance and a license. A sibling API
checkout is needed only when changing that runtime. Build a fresh checkout with
`npm run build` from the app directory; the prebuild installs/builds the bundled tools.
Do not copy another checkout's `node_modules` or generated `dist`.

For public API configuration, use the documented values in `.env.example`; `VITE_*`
values are public build inputs, never credentials. A local development API is optional
for local creation and editing. Publishing/authentication need a running API with the
matching release changes; a local desktop build does not deploy it.

### Platform acceptance

The current manual-testing target is **macOS Apple Silicon**, with an unsigned/ad-hoc
local package exercised on macOS 26.6.2. The declared minimum is macOS 13; that older
OS has not been exercised in this acceptance run. Native Windows x64 and Linux x64
packaged-runtime CI also passes at welcome source f09ae6938 (run 36773598438).
That covers startup, bundled runtime/CLI and the workflow’s named interaction/security
checks; it does not establish every hardware, keychain, installer or update behavior.
Intel Mac and older OS versions still need their own acceptance. Signed/notarized distribution and real-provider/hardware
acceptance remain separate release operations.

To stage without publishing or signing with an account, after the normal build/gates:

```bash
cd electron
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --mac --arm64 --publish never
CRUX_PACKAGED=1 npx playwright test --project=desktop e2e/packaged.spec.ts
```

The packaged test uses an isolated profile and proves that development mocks, API
overrides and raw SQL writes are disabled. For a manual session, launch the executable
with `CRUX_TEST_PROFILE` set to a new absolute directory; the packaged build uses that
storage location without granting test privileges. Keep that directory if you want to
resume your testing. Do not point automated tests at your personal Garden.

### Notices and source materials

`vite-plugin-notices.ts` emits `dist/THIRD-PARTY-NOTICES.txt` from packages loaded by the
renderer and its workers. Missing npm notices require reviewed, version-pinned copies
in `licenses/renderer/sources.json`; hash/version mismatches fail the build. Some upstream
packages supply only a notice and an external license reference; these are identified
in that manifest. GSAP uses its own Standard No Charge license, not an OSI license:
https://gsap.com/standard-license/. The app's MIT license does not relicense dependencies.
Fonts retain their OFL notices under `public/fonts/`. Crux Tools retain their own
LICENSE/UPSTREAM files. The staged desktop carries the app LICENSE, renderer/font/tool
notices and the native media corresponding-source archive described below. This is a
record of the materials shipped, not a claim that all dependencies use the same license.

## Native media binaries

Build the matched FFmpeg/ffprobe pair once with `npm run binaries:build` inside
`electron/`. This takes several minutes and needs Python 3.12+, a C/C++ compiler,
make, CMake, pkg-config, git and nasm on x86. On macOS, install the Xcode command
line tools plus `brew install cmake pkg-config nasm`. Linux uses its distribution's
build tools; Windows builds use an MSYS2 UCRT64 shell (see the native-media CI action).
The build targets the machine's architecture. It does not modify system tools.

The source lock is `electron/scripts/ffmpeg-sources.json`; the straight-line build
recipe is `electron/scripts/build-ffmpeg.py`. Downloads are checked against SHA-256
before extraction. Unmodified upstream sources and this recipe accompany the binaries
in `corresponding-source.tar.gz`, with license notices and a build receipt. The receipt
records pre-signing input checksums; platform signing can change the packaged executables. GPL codecs
make these separate executables GPL-3.0-or-later. Nonfree builds are refused.

Development reads `electron/.native-tools/<platform>-<arch>/`; build output and source
caches are ignored by Git. For an intentional rebuild, use a fresh `--output` directory,
verify it, then replace only the old generated target directory. Packaging validates the
current recipe, every required file, CPU architecture and notices through `beforePack`;
this also covers direct electron-builder commands. A missing or stale target fails the
build. CI builds each release architecture natively, then packages those artifacts.

Source hashes are integrity pins, not proof of an upstream identity. Review upstream
provenance, license changes and security updates when editing the lock; run both
verification gates and actual native-media/import/render journeys after rebuilding.

## The one gate

`npm run verify` in `./` and in `./electron` is the definition of green: typecheck, lint, tests,
build. UI behaviour is covered by Playwright against the real desktop app:

```bash
cd electron && nvm use
npm run binaries:build        # first setup only; see rebuild instructions above
npm run build:all && npm run test:e2e
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

The desktop/API pin `@nestjs/swagger`'s `js-yaml` dependency to 5.4.2 with a scoped
root override (GHSA-r3ph-w7gj-g6xm). Swagger 11.4.7 pins the affected 5.3.0 exactly,
so a lock refresh alone does not fix it. Keep the override until upstream adopts a
fixed version; preserve the builder/updater's separate 4.x dependency.

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

## Catalog test scope

The default verify gate builds and checks the bundled Crux Tools. Runtime packaging
assertions in `src/templates/*-app.test.ts` and the native stylesheet cases use the
same manifest scope; host, service and manifest tests still cover every tool. Use
`CRUX_BUNDLE_TOOLS=all npm run verify` for the complete prepared catalog (also run
by the weekly CI job). This is explicit scope, never a skip based on missing files.
