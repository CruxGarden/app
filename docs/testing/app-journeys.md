# App journey regression coverage

The app has service tests plus Playwright journeys driving the real Electron application. Every journey uses a throwaway Garden Root and user-data directory. User data and paid model calls are not needed; publishing tests use a local HTTP API, and agent journeys use the scripted model.

The focused app suite covers these boundaries:

| User behavior                                                                                                 | Playwright coverage            |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Create a Crux, choose its entry, use Clean/Advanced, restart                                                  | `clean-workshop.spec.ts`       |
| Write Notes, paste an image, save on view switch, reject conflicting edits, restart, archive/import           | `notes-crux.spec.ts`           |
| Choose the public notebook layout, preserve selection, navigate static pages, switch back to search           | `notes-sharing-layout.spec.ts` |
| Design Moqira frames, save on view switch, restart, reject conflicting edits, navigate selected public frames | `moqira-crux.spec.ts`          |
| Use Garden Mood or app appearance without leaking private appearance state into published output              | `app-appearance.spec.ts`       |
| Import a notebook, customize the app in a Task, merge without losing newer Main content, export/import        | `app-workflow.spec.ts`         |
| Share through the actual UI and inspect the HTTP upload, update and recover from failure                      | `embedded-app-sharing.spec.ts` |
| Independent Task files and previews, merge conflicts, restart and recovery                                    | `parallel-tasks.spec.ts`       |
| Main/Task attention, queueing, decisions and stop/restart ownership                                           | `tending.spec.ts`              |
| Inspect Main/Task history and retain its structure in an archive                                              | `growth-graph.spec.ts`         |

The focused suite also includes `onebigsky.spec.ts` (keyboard/bot game, local fonts, pause, source Growth and restart) and `cardinal-crux.spec.ts` (actual audio/rack edits, agent commands, presets, save conflicts and restart).

## Run locally

From `app/`, use the Node version in `.nvmrc` and run `npm run verify`.
From `app/electron/`, use a Node version compatible with its dependencies, then run:

```sh
npm run verify
npm run build:all
npm run test:e2e:apps
```

The CI pull-request job runs the same focused app suite after the existing workspace suite. The full desktop suite remains a separate main/manual gate. Failures retain Playwright screenshots and traces under `electron/e2e/.results`; CI uploads that directory. Run one failing specification while diagnosing, then rerun the affected suite after the fix. Do not use retries or skips to hide an unresolved regression.

## What this establishes

The tests cover interactions between the UI, real embedded apps, disk, local storage, history, native builds and HTTP upload. They establish specific behavior at the tested revision. They do not establish that every possible app state is correct, that live AI produces good content, or that production S3/CDN/auth infrastructure is healthy. Video-scale projects, detached agent execution, additional media tools and pipelines require their own future tests. A successful local mock publish is not a production deployment check.

## Latest verification: creative Cruxes, 2026-09-10

App and Electron `npm run verify` passed. App coverage includes 90 service/AI files / 878 tests, plus 7 Notes, 21 Moqira, 164 One Big Sky and 5 Cardinal model tests. All **18** focused desktop journeys passed in **6.1 minutes**, without retries or skips. The Cardinal journey uses a scripted model through the real executor, native engine and confirmed save. Existing generated Notes/Moqira demo fixtures were restored after the run; new Cardinal/One Big Sky screenshots are retained. This is local verification, not a remote CI, complete desktop-suite or production deployment claim.

## Earlier verification: sharing coverage, 2026-09-10

- App `npm run verify`: passed, including 87 service test files / 868 tests, 7 Notes tests, 21 Moqira tests, checks and builds.
- Electron `npm run verify`: passed.
- `npm run test:e2e:apps`: all 16 desktop journeys passed in 5.5 minutes.
- Existing workspace PR command: all 17 Playwright checks passed in 1.9 minutes (10 desktop journeys plus 7 preview-port checks).
- The two added Share tests exercise empty selections, pending Notes saves, selected-content HTTP uploads, local private-content retention, failed-update retry, and replacing Moqira's public selection.
- The static-preview regression test previously assumed a reload would still see empty browser storage. It now retains evidence of a foreign Crux's storage across reloads, while allowing a Crux to retain its own state, and checks both Cruxes.

The application code did not need changes for these new Share journeys. Existing demo archives/screenshots generated during the run were restored to their checked-in fixtures. The workflow definition is ready for PR CI; no remote CI run or production deployment is claimed.
