# Digital Garden

A Crux Garden template: a personal digital garden built on Astro, seeded from [Veka](https://github.com/masmuss/veka) (MIT). Notes live in `src/content/wiki/` as Markdown with frontmatter (`title`, `description`, `createdAt`, `updatedAt`, `tags`, `growthStage`), link to each other with `[[wikilinks]]`, and the site adds a folder tree, search (⌘K), tags, *Linked from* backlinks and a graph of the whole garden at `/graph`.

- Preview: the Workshop runs `astro dev`; `pnpm dev` works in a terminal too.
- Share: `astro build` renders `dist/`, which Crux Garden publishes.
- Settings: `src/config.json` (title, description, author, public URL).

See `UPSTREAM.md` for what is Veka's and what Crux Garden added.
