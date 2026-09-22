# Crux Functions consistency — 2026-09-21

The workspace and API use the same Acorn export lowering and seven-handler contract corpus. Named default handlers, exported constants/helpers, async helpers, export lists, destructuring and literal `export default` text retain their meaning. Static/dynamic handler imports are explicitly refused.

The local request passes method, path, query and headers; EVENT requests expose the event data through `req.json()`. Cookie and Authorization headers are excluded. Ownership comes from the Crux author, with normalization of the older local-author alias; arbitrary visitors do not become the owner. The API encodes ordinary return values as JSON, including strings and null, while explicit text/HTML responses keep their content type.

Validation:

- App `npm run verify`: 1,355 tests, tool gates and production build pass against the published Plasma UI 0.7.0 package.
- API `npm run verify`: 621 tests pass, five existing skips; build passes.
- Electron `npm run verify`: passes.
- Desktop `functions-local`, `order-desk`, `mood-title-font`: pass in the combined run. That run exposed a narrow Share pane in the API journey; after making room using the normal pane close controls, `functions.spec.ts` passes separately (1.2 minutes).
- API journey uses localhost:3001, isolated temporary desktop data and a synthetic signed-in account. It publishes the shared handler corpus, checks JSON values, HTTP method/path/query/header forwarding, anonymous ownership, encrypted secret availability, outbound allowlist calls, events, Store writes, the real scheduler, and Share-pane Run/Emit controls.
- The strengthened tests first reproduced the string encoding failure and a legacy local-owner mismatch in Order Desk. Both now pass.

Evidence: `local-api-functions.png`. Logs: `/private/tmp/crux-published-plasma-app-verify.log`, `/private/tmp/crux-functions-api-final-verify.log`, `/private/tmp/crux-functions-electron-verify.log`, `/private/tmp/crux-live-local-functions-final.log` (initial combined run), `/private/tmp/crux-live-local-functions-layout.log` (passing API journey).

This is local API acceptance, not production deployment or packaged-release acceptance. Workspace `ctx.fetch` remains subject to browser CORS; the API uses its host policy. Schedules run on the API clock. This does not change the VM isolation limits recorded in ADR 0051.
