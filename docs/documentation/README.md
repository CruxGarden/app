# Field guide and journal acceptance

Source: `documentation-crux/`, an ordinary Astro Starlight Site Crux. The Builder
edits Markdown pages/journal and JSON settings. No AI greeting or provider is required.
Explore offers a bundled static publication; Make a copy creates a separately owned
editable Crux. App updates never write into that copy. First editable preview/build
requires dependencies; offline reading/search use the build bundled with the app.

`npm run build:documentation` installs the locked toolchain and builds `/docs` and
`/blog` from that source. `npm run verify`, ordinary build/dev prebuild, and
`build:public` include it. Generated publication output is ignored by Git/history.
The source Crux retains licenses, self-hosted fonts, provenance and package-lock.json.

## Hosted routing (prepared, not deployed)

The public deployment uploads the generated docs/journal with the existing Vite site.
Associate `infra/public-site-router.js` as the public distribution's viewer-request
CloudFront Function (cloudfront-js-2.0), composing with existing rules if one is present.
It resolves only docs/blog directory links to their own index.html; it does not rewrite
Explore, author/Crux routes, the teaser or static assets. The source has a Node test.
The SPA also handles clean docs/blog URLs returned by an S3 error fallback, by navigating
to the exact HTML object. The CloudFront function avoids that fallback round trip.
Verify `/`, `/explore`, `/docs/`, a docs deep link, `/blog/`, a story, fonts and search
on the real host after deployment. No deployment or hosted acceptance is claimed here.

## Checks

- `src/templates/documentation.test.ts`: source-only template, licenses/fonts, no fake conversation.
- `electron/e2e/documentation.spec.ts`: real isolated desktop; blocked remote HTTP;
  AI off; guide navigation/search; copy, saved settings, real Astro build and restart. Renderer HTTP is blocked; the native toolchain can install the editable copy’s dependencies.
- `electron/e2e-web/documentation.spec.ts`: production public build; deep links, refresh,
  search, theme, docs↔journal navigation, 390px overflow/navigation and screenshots.
- `infra/public-site-router.test.mjs`: exact routing boundary with query/header preservation.

Final test results and any remaining limitations are recorded in the root living documents.

Desktop acceptance: 1 passed in30.7s; app verify1,644 tests/259 files +18 scoped skips/build, host76/one skip. Public docs/blog checks pass2/1.2min, including the production build and390px layout. The combined desktop gate passed59/60 in9.9min. The welcome journey’s loaded-photo observation raced an Astro iframe reload; its assertion now retries the complete observation. The corrected welcome journey and pane-color/geometry desktop check pass together2/41.0s; the complete app verify passes again1,644/259 +18 skips/build. Clean package refresh is recorded in the root handoff. The two Zen game journeys passed in that combined run.
