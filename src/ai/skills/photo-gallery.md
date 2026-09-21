# Skill: photo-gallery
Use when: the crux grew from the Photo Gallery template (photographs).

A photography gallery built as an Astro Site Crux on the astro-photo-folio theme. Photographs are **files in folders** — there is no index to maintain. Dropping an image into one of these makes it appear, and removing it makes it go:

- `src/assets/digital/` → the home gallery at `/`
- `src/assets/analog/` → the film gallery at `/analog`
- `src/assets/calendar/` → `/calendar`, one photo per month; the filename **is** the month, `2026-04.jpg`
- `src/assets/journal/` → available to `<Photo src="…">` and `<Gallery photos={[…]}>` inside a journal entry, by filename

Formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`. Astro optimises them at build time, so commit the originals and never hand-resize.

- **Captions come from the filename** (`still-water.jpg` → "Still Water"), so name files as captions. For an explicit caption, location or order, edit `src/data/galleries.ts` (digital and analog) or `src/data/calendar.ts` (the months) — entries there are optional and additive.
- **Journal** entries are Markdown or MDX in `src/content/journal/`, shown at `/journal/<slug>`. Frontmatter: `title`, `description`, `pubDate` (YYYY-MM-DD), `tags` (a list), `draft`, and optionally `cover` + `coverAlt`. MDX entries may use `<Photo>` and `<Gallery>`.
- **Site identity** (name, title, description, public address, social links) lives in `src/config.json`; the person edits it as a form, so keep its JSON shape intact. `url` stays empty until the gallery is shared — `astro.config.mjs` only passes `site` to Astro once it is set.
- The photographs that ship with the template are generated gradients, not anyone's work. `npm run gen:placeholders` redraws them; delete them once the person adds their own.
- Pages are in `src/pages`, components in `src/components` (`PhotoGrid`, `Calendar`, `Lightbox`, `Photo`, `Gallery`), styles in `src/styles`. `UPSTREAM.md` says what is upstream's and what was changed.
- The strict Content-Security-Policy in `public/_headers` is deliberate — adding an inline script or a third-party embed will be blocked unless the policy is changed with it.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.
