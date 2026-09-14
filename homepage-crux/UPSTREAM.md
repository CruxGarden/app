# Upstream: Astro Keel

- Source: https://github.com/kpab/astro-keel — "a minimal, neutral, and modern portfolio + blog theme for Astro" by kpab. Pinned: commit `84c55e1` (v0.2.0, 2026-09-03). License: MIT (`LICENSE`, kept verbatim).
- Astro 7.2, self-hosted fonts (`@fontsource`), MDX, RSS, Pagefind search (a `postbuild` step), satori/sharp social-card images, a UI dictionary (`src/i18n`, `en` and `ja`), dark mode, Giscus comments off by default. Content collections `src/content/works/**` and `src/content/blog/**`.

## What is upstream, unchanged

`src/components`, `src/layouts`, `src/i18n`, `src/lib`, `src/styles`, `src/pages` except the two rewritten below, `public/`, `remark-reading-time.mjs`, `tsconfig.json`, dependencies, `README.md`.

## What Crux Garden changed

- **Identity in `src/config.json`** (`src/consts.ts` reads it): name (the site title and home heading), tagline, about text, public address, locale, footer text. `SOCIAL_LINKS` keeps only the RSS icon (the GitHub link was the theme's).
- **`astro.config.mjs`**: `base` dropped (the theme ships set up for a GitHub Pages subpath); `site` and the sitemap switch on only when the address is set, so a fresh site builds unshared.
- **Home page and about page** rewritten to read the person's name, tagline and about text instead of the theme's placeholder essay; the works and posts sections are upstream's.
- The theme's footer link to its author's almanac is removed.
- **`tech` on a work defaults to `[]`** so the Builder can create a work from title, description and date alone.
- **Seed content** replaces the theme's sample works and posts (and their images): one post, one work.
- pnpm lockfile generated from upstream's npm lockfile (`pnpm import`); `.cruxignore` keeps `node_modules/`, `dist/` and `.astro/` out of Growth. `astro check` reports one upstream type error in `og/[collection]/[slug].png.ts` (satori's VNode vs TypeScript 6) that predates the fork.

Build: `pnpm install && pnpm build` (Node 22; Pagefind runs after the build).
