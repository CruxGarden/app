# Manual review

The Release Expedition is a standalone, offline review game. Use its missions
alongside the desktop app, record demonstrated outcomes, and export your results.
Its progress is separate from the app's Garden and settings.

## Start on macOS

From the app repository:

```sh
npm run review
```

This opens the packaged app with a new, empty Garden and opens the game in Google
Chrome. The profile directory is printed in Terminal. Existing Gardens are not
deleted or changed. Quit older copies of Crux Garden first to avoid reviewing the
wrong window.

The default package is
`electron/release/manual-testing-novice-oct6/mac-arm64/Crux Garden.app`, the local
October 6 review candidate. It is not automatically rebuilt or downloaded.
On another checkout, install the app and Electron dependencies and build a Mac
package with `npm run dist:mac:unsigned` in `electron/`, following the main
README's native build prerequisites. Then select the generated `.app`:

```sh
CRUX_REVIEW_APP="/absolute/path/to/Crux Garden.app" npm run review
```

## Continue or start over

- Open `Resume Review.command` inside the printed profile directory to return to
  the same Garden and the same packaged build.
- Or run `npm run review -- --resume /absolute/path/to/review-profile`.
- Run `npm run review` again for another empty Garden and the setup wizard.
- In the game, export any results you want to keep, then choose **Start a new
  run** to clear its results. Choose **First sitting · local core loop** to begin.

The script does not reset browser results. If moving from the old root-level
guide, export there and import here to carry your results across file locations.
The packaged app uses its configured hosted services; isolating its local Garden
does not turn sign-in, AI, or publishing into mock operations.

## Maintain the game

This directory is the maintained source in the app repository. The former
root-level guide is retained locally for existing results, not as a second copy
to edit.

- `story-scenarios.json`: outcomes, scenarios, and tool-specific review steps.
- `V1-TESTING-GUIDE.md`: detailed baseline checks consumed by the generator.
- `story-guide.template.html`: game UI and local result storage.
- `build-story-guide.py`: reconciles scenarios with the current creation menu,
  tool manifests, panels, settings, and commands; refuses unmapped surfaces.
- `v1-user-stories.html` and `story-coverage.json`: committed generated outputs.
- `verify-story-guide.mjs`: isolated browser checks of navigation, results,
  export/import, conflicting tabs, storage refusal, and coverage.

```sh
npm run review:build-game
npm run review:verify-game
```

Generation requires Python 3; verification uses Playwright from `electron/`
(`npx playwright install chromium` there if needed). A sibling API checkout is
optional: its revision is recorded when present, otherwise shown as unavailable.
Recorded source revisions describe the guide snapshot; enter the actual app
build and service target you review in the game's setup fields. The generated
game opens without Node, Python, or a local server.
