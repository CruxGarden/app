# Skill: business-page
Use when: the crux grew from the Business Page template (a business site).

A business website built as an Astro Site Crux on the Foxi theme. The words are placeholders describing what belongs in each place, not a real product — replacing them is the work.

- **Settings**: `src/config.json` (name, one-line description, public address). The person edits it as a form, so keep its JSON shape intact. `url` stays empty until the site is shared; `astro.config.mjs` only passes `site` to Astro once it is set.
- **The content is data, not markup.** `src/data/json-files/featuresData.json` (what the business does — `title`, `icon`, `description`, `category`), `faqData.json` (`question`, `reply`), `pricingTablesdata.json` (tiers: `header`, `body`). Edit these rather than the pages. An `icon` must name a file in `src/icons/` or the build fails.
- **News** lives in `src/content/blog/*.md` at `/blog/<slug>`. Frontmatter: `title`, `pubDate`, `description`, `author`, `image` (a path under `public/blog/`), `tags`.
- **Terms**: `src/data/markdown-files/terms.md`, rendered by `/terms`. It is a scaffold of headings that says it is not legal advice — keep that caveat unless the person replaces the text with their own.
- **Menus**: `src/config/navigationBar.ts` and `src/config/footerNavigation.ts`; social links in `src/config/socialLinks.ts`. The brand text comes from `config.json` through `configData.siteTitle` — do not hard-code a name.
- Pages are in `src/pages`, composed from blocks in `src/components/blocks/`. Prefer changing data and config over editing blocks; the blocks are upstream's and carry the design.
- This template deliberately ships **no analytics** and no third-party tracking (ADR 0008). Do not add any.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.
