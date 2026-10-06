# Release Expedition Moods — October 1 acceptance

Six ordinary bundled Moods: Sunflower, Lagoon and Berry, each Light/Dark. Dotted paper, colored headers, ink outlines and offset shadows use portable theme tokens. No image downloads or AI required.

Builder additions: workspace pane shadow, labelled-button outline width, button shadows and primary-button highlight. Existing Moods retain their defaults. Colors have an explicit opacity percentage; RGB changes retain alpha. Text uses editable colors rather than hidden half-opacity. Disabled controls use the existing disabledOpacity token; busy/inactive/secondary-action/decorative roles have explicit tokens. Visibility transitions remain behavior.

- App `npm run verify`: 1,676 tests /266 files,18 skips; typecheck/lint/performance checks/tool checks/build pass. `/tmp/mood-alpha-app-final.log`.
- Focused color, portable-Mood and token-consumption checks:9/3. `/tmp/mood-alpha-focused.log`.
- Real isolated desktop, AI off: Light/Dark apply; actual button width/corners and pane shadows; live shadow and RGBA edits; restart preservation.1/15.6s, `/tmp/mood-alpha-desktop.log`.
- `sunflower-light.png`, `sunflower-dark.png`: actual desktop screenshots, reviewed. `contrast-*.json`: zero color-contrast violations in the scanned Home/Settings states; incomplete checks, if present, remain manual. Palette tests cover text/background, primary-button and header pairs across all six palettes.
- Earlier checks exposed low-contrast Garden brief text and disabled-toggle labels; both now use the readable Mood text color. Initial harness failures (ancestor selection, Electron axe configuration) were corrected.

Scope: first-party component partial dimming. Public teaser rendering, third-party editor interiors, and the broader motion/hover exception inventory were not comprehensively migrated. Native release signing, hosted deployment and manual assistive-technology acceptance remain separate. The package acceptance below covers the guided Customizer build.

## Guided Customizer and Paper family

The Theme tab opens the guided Customizer: text size, accent/background, typeface, surface, spacing, corners, depth and motion. Full Theme Builder exposes every registered token and font assets. Both edit the same portable Mood settings; returning or resetting quick controls preserves unrelated advanced edits. Typography is editable by people and agents, with the existing fonts retained as defaults.

Paper groups the six palettes under one family with texture and outline choices. Package IDs remain unchanged. Plasma and Soft are the other implemented families; Glass currently remains a surface option. Four equal families are recommended, not yet all implemented.

- Full app gate: 1,679 tests /267 files,18 skips; typecheck/lint/checks/build pass. `/tmp/customizer-app-verify.log`.
- Electron gate:77 tests +one skip. `/tmp/customizer-electron-verify.log`.
- Six real desktop journeys pass in1.2 minutes: Customizer/default/full editing, Paper geometry/contrast, token persistence, portable Mood save/apply, dimensions and assets. `/tmp/customizer-desktop.log`.
- Accessibility regression:8/8 in1.5 minutes,18 axe states with zero reported violations. `/tmp/customizer-accessibility.log`. Automated scans do not replace assistive-technology acceptance.
- `customizer.png` and refreshed Sunflower screenshots show the actual desktop UI. Test profiles are isolated from real user Gardens.

Actual macOS arm64 package `manual-testing-paper-customizer-oct1` passes Customizer/restart and startup/SQLite/CLI acceptance:2/2 in24.7s (`/tmp/customizer-packaged-acceptance.log`). The familiar manual-testing launcher selects it; the existing Garden is preserved. This is an ad-hoc-signed test candidate, not a notarized release. Native Windows/Linux acceptance for this new commit remains pending.
