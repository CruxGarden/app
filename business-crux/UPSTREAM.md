# Upstream: Foxi

- Source: https://github.com/oxygenna-themes/foxi-astro-theme — a Tailwind CSS
  Astro starter by Oxygenna.
- Pinned: commit `7c8820c` (2026-09-17). License: MIT (`LICENSE`, kept verbatim).
- Astro `^7.3.3`, Tailwind, `astro-icon`, `sharp`, self-hosted
  `@fontsource-variable` fonts. No CDN, no hosted service.

Chosen over [AstroWind](https://github.com/onwidget/astrowind), the other strong
candidate (MIT, Astro 7.3, actively maintained): AstroWind is a *showcase* —
four alternate home pages and six landing-page variants — so most of the work
would have been deleting it. Foxi is already one coherent site.

## What is upstream, unchanged

`src/components/**` (the blocks, the UI primitives), `src/layouts/**`,
`src/styles/**`, `src/icons/**`, `src/assets/**`, `src/content.config.ts`,
`tailwind.config.mjs`, `postcss.config.mjs`, `tsconfig.json`, `public/**`.
The design, the responsive behaviour and the component structure are Foxi's.

## What Crux Garden changed

- **Settings in `src/config.json`** (`src/config/config.ts` reads it) so the
  Builder's settings form, any editor and the collaborator can name the
  business without touching code. The navigation and footer take their brand
  from it too, instead of a hard-coded string.
- **No analytics** (ADR 0008). Google Analytics, Tag Manager and Search
  Console — their config, their four script components and the calls in
  `Header.astro` and `Layout.astro` — are gone.
- **The author's upsell moved rather than removed.** Foxi ships a toast
  advertising [Foxi Pro](https://astro.build/themes/details/foxi-pro/), the
  author's paid version. It cannot stay on the page: a business that publishes
  this site would be advertising an Astro theme to its own customers, which is
  not its deal to make. The credit belongs where the person who might actually
  buy it will see it — here, in the README, and in the Crux's Tool Info panel.
  **If you like this template, [Foxi Pro](https://astro.build/themes/details/foxi-pro/)
  is by the same author, [Oxygenna](https://github.com/oxygenna-themes), and
  buying it supports the work this starter is built on.**
- **`@astrojs/sitemap` dropped** — it needs a site URL, which this template does
  not have until it is shared. `astro.config.mjs` passes `site` to Astro only
  once `config.json` has one, and `robots.txt` no longer advertises a sitemap
  (it was throwing `Invalid URL` at build without it).
- **Changelog dropped** — a software-release idea, not a business page's. The
  page, its data file, its feed block and its two menu entries.
- **The content is a business, not a product.** Foxi's demo is a fictional
  productivity app; every page's copy, the features, questions, prices, the two
  news posts and the terms are rewritten as placeholders that say what belongs
  in them. Zero references to the upstream brand remain.
- **Terms render from Markdown.** `src/pages/terms.astro` held 170 lines of
  invented terms of service; it now renders `src/data/markdown-files/terms.md`,
  which is a scaffold of headings that says plainly it is not legal advice.
- **Scroll animations default to off** (`config.json`). `.scroll-animation .col`
  starts at `opacity: 0` and an IntersectionObserver reveals it, so anything not
  scrolled past stays invisible — a blank page in the Workshop's pane. Upstream
  also built the observer inside a `DOMContentLoaded` listener, which never runs:
  an Astro `<script>` is a module and executes after that event has fired. That
  is fixed in `LocalScripts.astro` (and its `astro:page-loaded` typo, for
  `astro:page-load`), so turning the animations on works — but off is the right
  default for a template someone previews in a pane.
- `.cruxignore` keeps `node_modules/`, `dist/` and `.astro/` out of Growth.

Tests: `npx astro build` (13 pages) after `npm install`;
`e2e/business-page.spec.ts` drives the journey in the app.
