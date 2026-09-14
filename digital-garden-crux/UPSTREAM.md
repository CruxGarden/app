# Upstream: Veka

- Source: https://github.com/masmuss/veka — "a minimalist digital garden" theme for Astro by Khoirul Fattah (masmuss).
- Pinned: commit `22f50e3` (v1.2.0, 2026-07-24). License: MIT (`LICENSE`, kept verbatim).
- Astro `^7.0.6`, Tailwind 4, `astro-pagefind` (search), `remark-wiki-link` (wikilinks), MDX, KaTeX.

## What is upstream, unchanged

`src/components/ui/*` (the bejamas-style primitives), `src/components/wiki/{FileTree,NoteCard,WikiHeader,WikiNav,WikiNavNode,WikiSidebarLeft,WikiSidebarRight}.astro`, `src/components/search`, `src/components/seo/{ArticleMeta,JsonLd}.astro`, `src/layouts/BaseLayout.astro`, `src/pages/{tag,tags}`, `src/pages/wiki/[...slug].astro` (one prop added), `src/lib/{seo,utils}.ts`, `src/lib/wiki/{generate-breadcrumbs,get-tags,tree-utils,wiki-link-resolver.mjs,remark-custom-syntax.mjs}`, `src/lib/search`, `src/assets/styles/prose.css`, `src/content.config.ts`, `tsconfig.json`.

## What Crux Garden changed

- **Settings in `src/config.json`** (`src/lib/site-config.ts` reads it) so the Builder's settings form and any editor can name the garden; `site` is unset until the garden has a public address (`Seo.astro` keeps links relative then; `JsonLd` already coped).
- **Offline fonts and styles**: the Google `fontProviders` block and the `<Font>` tags are gone (system stacks in `global.css`); KaTeX's CSS is imported from the package instead of a CDN; `bejamas` (fonts CLI + a keyframes sheet nothing here uses) and `@astrojs/sitemap` (needs a site URL) are dropped, with `robots.txt` trimmed to match.
- **Tooling trimmed**: no semantic-release, commitlint, lefthook, eslint, prettier, `preinstall: only-allow pnpm` or `packageManager` pin — the app's bundled pnpm on Electron's Node runs `install`, `dev` and `build`. `pnpm-lock.yaml` regenerated after the dependency changes (the toolchain installs in CI mode, which freezes the lockfile).
- **Backlinks and the graph** (the garden features Veka lacks): `src/lib/wiki/links.mjs` indexes every note's outgoing `[[wikilinks]]` (aliases with `|`, `#headings`) and `/wiki/…` links with the same basename resolution as `wiki-link-resolver.mjs`; `garden-index.ts` reads the folder at render time. `components/wiki/Backlinks.astro` (*Linked from*) sits under every note; `pages/graph.astro` draws the garden with `force-graph` (MIT) coloured by growth stage, fed by `pages/graph.json.ts`; the header and the home page link to it. `aliasDivider: "|"` is set so Obsidian-style aliases work.
- **Home grouping**: top-level notes group under "notes" instead of one group per note.
- **Seed content**: Veka's project-wiki samples replaced by five notes about gardening itself (welcome, what a digital garden is, growth stages, tending, learning in public), linked so backlinks and the graph have something to show.
- `.cruxignore` keeps `node_modules/`, `dist/` and `.astro/` out of Growth.

Tests: `npm run test:garden` (the link index, node:test, no install needed); `pnpm exec astro check` and `pnpm exec astro build` after `pnpm install`.
