# Business Page

A Crux Garden template: a business website built on Astro, seeded from
[Foxi](https://github.com/oxygenna-themes/foxi-astro-theme) (MIT) by
[Oxygenna](https://github.com/oxygenna-themes) — whose paid
[Foxi Pro](https://astro.build/themes/details/foxi-pro/) has more of the same
design if you want it.

Home, what you do, pricing, questions, news and contact — the pages a small
business or studio actually needs, with placeholder copy that tells you what
belongs in each one rather than pretending to be a product.

| What | Where |
| --- | --- |
| Name, description, public address | `src/config.json` |
| What you do | `src/data/json-files/featuresData.json` |
| Questions and answers | `src/data/json-files/faqData.json` |
| Prices | `src/data/json-files/pricingTablesdata.json` |
| Terms | `src/data/markdown-files/terms.md` |
| News posts | `src/content/blog/*.md` |
| Menus | `src/config/navigationBar.ts`, `src/config/footerNavigation.ts` |
| Social links | `src/config/socialLinks.ts` |

- **Preview**: the Workshop runs `astro dev`; `pnpm dev` works in a terminal too.
- **Share**: `astro build` renders `dist/`, which Crux Garden publishes.
- **Settings**: `src/config.json`. The Builder's settings form writes this file.
- **Scroll animations are off by default.** The theme fades each block in as you
  reach it, which looks good on a wide screen and leaves the page blank in a
  narrow preview pane until something scrolls. Set `"scrollAnimations": true` in
  `src/config.json` if you want them on the published site.

See `UPSTREAM.md` for what is upstream's and what Crux Garden changed.
