# Production dependency check — October 1

Scoped `npm audit --omit=dev --json` checks were run in app, app/electron, app/tool-cruxes, api, cli and plasma-ui. App/API/CLI/plasma-ui reported zero advisories. Electron reported two moderate packages; the aggregate tool runtime reported one high and one low package.

Compatible transitive patch updates only:

| Tree                                         | Dependency    | Before → after  | Advisory                                 |
| -------------------------------------------- | ------------- | --------------- | ---------------------------------------- |
| Electron, through MCP SDK/Ajv                | fast-uri      | 3.1.7 → 3.1.8   | GHSA-hrr3-gc8f-f4qj                      |
| Electron, through MCP SDK/express-rate-limit | ip-address    | 10.7.0 → 10.7.2 | GHSA-j6r3-76f7-8jcv; GHSA-h3mg-xc3c-68pw |
| Aggregate tools, through Univer protocol     | @grpc/grpc-js | 1.14.4 → 1.14.5 | GHSA-m9gg-hp2v-232j; GHSA-f596-whhp-79r4 |
| Aggregate tools, through Excalidraw/Mermaid  | dompurify     | 3.4.15 → 3.4.16 | GHSA-p98j-92pf-mc4p                      |

The package manifests and parent version constraints are unchanged. Each lockfile changes only the version, resolved URL and integrity of the two affected entries. Both updated trees report zero advisories. The aggregate tool build regenerates the vendor bundles and third-party notices from its lockfile.

These are registry advisory checks, not a security proof or a reachability assessment. They do not clear the separate GitHub default-branch alert count across embedded upstream forks. Upstream editor source trees and their full development dependencies require their own triage when built/distributed; neither their inclusion in the repository nor an advisory alone proves runtime exploitability.

Acceptance results are recorded below after verification. Audit JSON/logs: `/tmp/v1-*-production-audit*.json`, `/tmp/v1-dependency-*-verify.log`.

Accepted checks:

- App `npm run verify`: 1,686 tests / 267 files, 18 skips, plus tool suites/typecheck/lint/build (`/tmp/v1-dependency-app-verify.log`).
- Electron `npm run verify`: 77 pass, one skip (`/tmp/v1-dependency-electron-verify.log`).
- Actual desktop Whiteboard and Spreadsheet: editing, scripted collaborator changes, native export, conflicting external edits and restart; Whiteboard PNG/SVG output and fixture-backed publication. Three pass in 57.4s (`/tmp/v1-dependency-desktop-final.log`). This does not establish production hosted publication or real-model behavior.
- Initial three failures waited for a closed Tasks panel's absent bar button. The two older specs now use the existing shared panel helper; product behavior was unchanged. The full rerun above passed.
- Updated production audit JSON: zero advisories in both changed dependency trees.
