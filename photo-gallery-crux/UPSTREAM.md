# Upstream: astro-photo-folio

- Source: https://github.com/XD-QIN/astro-photo-folio — "a minimal, fast
  photography portfolio and blog template" by Xudong Qin (XD-QIN).
- Pinned: commit `87dc958` (2026-09-04). License: MIT (`LICENSE`, kept verbatim).
- Astro `^7.0.6`, `@astrojs/mdx`, `@fontsource/{eb-garamond,cormorant-garamond}`.
  No Tailwind, no CDN, no hosted service: four dependencies in all.

Chosen over the alternatives for reasons worth recording, since the obvious
search results look similar from outside: `rockem/astro-photography-portfolio`
is the better _shape_ but sits on Astro 5.8 and has not moved since June 2025;
`erfianugrah/revista-3` serves its images from a Cloudflare CDN and wants Docker
and Bun, which a local-first app cannot use; `kydecker/astro-photo-grid` bundles
Fancybox, which is GPLv3-or-commercial rather than MIT.

## What is upstream, unchanged

`src/components/{BaseSchema,Calendar,Gallery,Icon,Lightbox,Logo,Photo,PhotoGrid,PostCard,ShareButton,Sidebar}.astro`,
`src/layouts/`, `src/lib/photos.ts`, `src/data/{galleries,calendar}.ts`,
`src/styles/`, `src/pages/{index,analog,calendar,about,contact,license}.astro`,
`scripts/`, `public/`, `tsconfig.json`. The galleries, the lightbox, the
justified grid, the EXIF handling, the calendar and the strict-CSP decisions are
all upstream's, including the comments explaining them.

## What Crux Garden changed

- **Settings in `src/config.json`** (`src/config.ts` reads it) so the Builder's
  settings form, any editor and the collaborator can name the gallery without
  touching code. `url` is empty until the gallery is shared: `astro.config.mjs`
  only passes `site` to Astro once it exists, so canonical links and Open Graph
  tags stay relative rather than claiming `https://example.com`.
- **One journal instead of two blogs.** The template is a photo gallery, so the
  Tech Blog is gone (`src/pages/blog/tech/`, `src/content/tech/`) and the Photo
  Blog became the **Journal** at `/journal` (`src/content/journal/`,
  `src/assets/journal/`), collection `journal`, with the nav, `llms.txt`, the
  About page and the example entry following it.
- **`@astrojs/sitemap` dropped** — it needs a site URL, which this template does
  not have until it is shared. `robots.txt` no longer advertises a sitemap.
- **The privacy policy is gone** (`src/pages/privacy.astro` and its two links).
  It was a sensible default, but a bundled template should not ship a policy
  nobody has read. The image-licensing page stays: it is part of what a photo
  gallery says for itself, and the JSON-LD points at it.
- `.cruxignore` keeps `node_modules/`, `dist/` and `.astro/` out of Growth.

The photographs in `src/assets/` are upstream's **generated placeholders** —
gradients drawn by `scripts/generate-placeholders.mjs` with the `sharp` that
ships with Astro, offline and with no external assets — not anyone's
photography. `npm run gen:placeholders` redraws them.

Tests: `npx astro build` (8 pages) after `npm install`;
`e2e/photo-gallery.spec.ts` drives the journey in the app.
