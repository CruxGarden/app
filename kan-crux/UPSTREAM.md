# Kan for Crux Garden — integration in progress

This is an independent adaptation of [Kan](https://github.com/kanbn/kan), pinned at `386cdcd200e81b47dbbd42ace8a817a38d6502ea`. The original board library, boards, cards, forms, query hooks and native styling are retained. Original source and license files remain in this folder. See root `LICENSE`; individual package metadata may carry separate licensing statements (including `packages/shared/package.json`). Preserve these when distributing source or a built adaptation. No endorsement is implied.

**This fork is not yet registered as a Crux Tool. The standalone browser proof keeps changes in memory; the embedded entry now uses Garden’s owner-scoped confirmed-save protocol.** Board records, preferences and original attachments now travel through that protocol, with bounded agent inspect/create/rename/move commands. Hosted-control cleanup, remaining local CRUD/filtering, template registration and complete desktop/archive acceptance remain unfinished. Canonical status is `../../WORK-CHECKLIST.md` and `../../KAN-INTEGRATION-ASSESSMENT.md` in the CruxGarden root.

## Local browser adaptation

`garden/boot.ts` initializes native Lingui before importing views. `garden/app.tsx` composes actual native views/providers with a small local navigation strip. Next routing uses one hash route context. `garden/api.tsx` keeps actual tRPC React Query hooks, replacing transport with a validated local operation dispatcher. `garden/model.ts` preserves native public IDs, index ordering, activity and date shapes, clones query results away from canonical memory, and validates portable JSON before replacing state. Unsupported operations fail explicitly.

Supported proof: create a board and lists, create/move cards, labels, due dates, checklists/items and comments. Eleven model tests cover movements, cache isolation, rejected operations, native card details, restoring portable JSON and rejection of corrupt state and complete rapid-edit activity pagination. `garden/browser-proof.mjs` drives the actual built UI. It requires the Playwright dependency installed in the parent app's Electron project.

`package.upstream.json` and `pnpm-lock.yaml` preserve the original hosted workspace dependency declaration. The new root package/lock build the independent browser entry using pinned native web dependencies. Relative TypeScript base-config paths allow building outside the upstream pnpm workspace. The original backend remains reference source; no hosted service/authentication/database or hosted build is claimed supported by this local proof.

Build: Node 22, `npm ci --ignore-scripts && npm run build`. The resulting `runtime/` is generated. Native source dependencies report audit findings; review and targeted remediation remain before acceptance. This is not a claim that the pinned source/dependency set is ready for public release.


## Confirmed save and drafts

`garden/bridge.js` follows the existing native app protocol: owner-bound reads, fingerprinted record/original imports, optimistic document writes, dirty/flush acknowledgements and queued agent commands. Each board is a separate JSON Artifact; unchanged original bytes retain their imported reference. `garden/state.ts` replaces localStorage with captured preferences (including property assignment), restores the route, waits for native mutations and attachment imports, and commits on-blur fields only during explicit flush. Native open creation forms and unsent comments block confirmation/navigation until committed or cancelled. Failed UI edits remain dirty until corrected or explicitly reloaded; rejected agent commands do not manufacture a UI draft. Discard uses an in-document confirmation.

Attachments use native upload/thumbnail/download interfaces and local Blob URLs. Original bytes are separate fingerprinted Artifacts, up to 64 MB each. Missing originals fail restoration before replacing the open model. The local provider harness verifies exact bytes after fresh-page restore, reuse during text edits, immediate title flush, form/comment retention, navigation blocking, conflict handling, explicit discard and agent commands. This is not the final isolated Electron/archive-import acceptance.

Checks: `npm run check:garden` typechecks the local model/commands and their native schemas; `npm run test:garden` runs eleven model/operation tests; `npm run build`, `npm run test:browser` and `npm run test:provider` exercise actual native UI and the embedded protocol. The host service tests are `src/services/kan-app.test.ts` in the parent app.

The original `pnpm lint` / `pnpm typecheck` commands were attempted. Pnpm first tried to initialize the retained hosted monorepo and stopped on its ignored build-script policy, before these checks ran. The original workspace lock/config were restored and the independent `npm ci --ignore-scripts` setup rebuilt and tested. Use the npm commands above for the local adaptation; the hosted monorepo is retained reference source, not a verified local backend.
