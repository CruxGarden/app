# Release Expedition Moods — October 1 acceptance

Six ordinary bundled Moods: Sunflower, Lagoon and Berry, each Light/Dark. Dotted paper, colored headers, ink outlines and offset shadows use portable theme tokens. No image downloads or AI required.

Builder additions: workspace pane shadow, labelled-button outline width, button shadows and primary-button highlight. Existing Moods retain their defaults. Colors have an explicit opacity percentage; RGB changes retain alpha. Text uses editable colors rather than hidden half-opacity. Disabled controls use the existing disabledOpacity token; busy/inactive/secondary-action/decorative roles have explicit tokens. Visibility transitions remain behavior.

- App `npm run verify`: 1,676 tests /266 files,18 skips; typecheck/lint/performance checks/tool checks/build pass. `/tmp/mood-alpha-app-final.log`.
- Focused color, portable-Mood and token-consumption checks:9/3. `/tmp/mood-alpha-focused.log`.
- Real isolated desktop, AI off: Light/Dark apply; actual button width/corners and pane shadows; live shadow and RGBA edits; restart preservation.1/15.6s, `/tmp/mood-alpha-desktop.log`.
- `sunflower-light.png`, `sunflower-dark.png`: actual desktop screenshots, reviewed. `contrast-*.json`: zero color-contrast violations in the scanned Home/Settings states; incomplete checks, if present, remain manual. Palette tests cover text/background, primary-button and header pairs across all six palettes.
- Earlier checks exposed low-contrast Garden brief text and disabled-toggle labels; both now use the readable Mood text color. Initial harness failures (ancestor selection, Electron axe configuration) were corrected.

Scope: first-party component partial dimming. Public teaser rendering, third-party editor interiors, and the broader motion/hover exception inventory were not comprehensively migrated. Native release signing, hosted deployment and manual assistive-technology acceptance remain separate. Current package refresh follows the queued guided Customizer block; this evidence establishes the source build.
