# Photo Gallery

A Crux Garden template: a photography gallery built on Astro, seeded from
[astro-photo-folio](https://github.com/XD-QIN/astro-photo-folio) (MIT).

Photographs are **files in folders** — drop a `.jpg`, `.png`, `.webp` or `.avif`
into one of these and it appears, no config to edit:

| Folder | Where it shows |
| --- | --- |
| `src/assets/digital/` | the home gallery |
| `src/assets/analog/` | the film gallery at `/analog` |
| `src/assets/calendar/` | `/calendar`, one photo per month — name the file `2026-04.jpg` |
| `src/assets/journal/` | available to `<Photo>` and `<Gallery>` inside a journal entry |

Captions default to the filename (`still-water.jpg` → "Still Water"), so naming
a file well is enough. `src/data/galleries.ts` and `src/data/calendar.ts` hold
the per-photo captions and locations when you want them.

- **Journal**: Markdown or MDX in `src/content/journal/`, shown at `/journal`.
- **Preview**: the Workshop runs `astro dev`; `pnpm dev` works in a terminal too.
- **Share**: `astro build` renders `dist/`, which Crux Garden publishes.
- **Settings**: `src/config.json` — the name, the description and the public
  address, plus social links. The Builder's settings form writes this file.

The photographs that ship with the template are **generated gradients**, not
anyone's work: `npm run gen:placeholders` regenerates them offline. Delete them
and drop in your own.

See `UPSTREAM.md` for what is upstream's and what Crux Garden changed.
