# Upstream: Astro Cactus

- Source: https://github.com/chrismwilliams/astro-theme-cactus — "an opinionated starter theme for Astro" by Chris Williams. Pinned: commit `210d96d` (v8.2.0, 2026-07-24). License: MIT (`LICENSE`, kept verbatim).
- Astro 7.0.4 pinned, Tailwind 4, MDX, Expressive Code, Pagefind search (a `postbuild` step), satori/sharp OG images, RSS, webmentions (optional, needs `WEBMENTION_API_KEY`), a dark/light theme toggle. Content collections at the repository root: `content/posts/**` (folders allowed, e.g. `markdown-elements/index.md`), `content/notes/**`, `content/tags/**`.

## What is upstream, unchanged

`src/` (components, layouts, pages, plugins, styles, utils, data, types, assets), `public/`, `tailwind.config.ts`, `tsconfig.json`, `pnpm-workspace.yaml` (pnpm's allowed build scripts: sharp, esbuild, oxide), `pnpm-lock.yaml`, dependencies, `README.md`, `content/posts/markdown-elements/` (the theme's Markdown reference post).

## What Crux Garden changed

- **Settings in `src/config.json`** (`src/site.config.ts` reads it): title, description, author, public address, language. `site` and the sitemap integration switch on only when the address is set, so a fresh blog builds without one.
- **Builds without a public address**: the canonical link stays relative, webmentions are skipped, the two RSS feeds use a stand-in `site` until `url` is set (set it after the first Share; the Share pane shows the address). `astro check` reports one upstream type error in `og-image/[...slug].png.ts` (satori-html's VNode vs TypeScript 6) that predates the fork.
- **`postinstall: npm rebuild sharp --force` removed**: pnpm installs sharp's prebuilt binary, and the app's toolchain has no `npm` on its PATH.
- **Seed content** replaces the theme's test posts (drafts, long titles, social-image and webmention samples): a welcome post, a first note, a `garden` tag. The Markdown-elements reference post stays.
- `.cruxignore` keeps `node_modules/`, `dist/` and `.astro/` out of Growth. Tooling files (biome, prettier, editor configs, GitHub workflows) are not carried.

Build: `pnpm install && pnpm build` (Node 22; Pagefind runs after the build).
