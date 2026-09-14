# Skill: digital-garden
Use when: the crux grew from the Digital Garden template (linked notes).

A digital garden built as an Astro Site Crux on the Veka theme. Notes are Markdown files under `src/content/wiki/` (folders become sections: `notes/`, `essays/`, or any the person makes); each becomes `/wiki/<path>`. `index.md` is the front gate at `/wiki`. The home page groups notes by folder; `/tags` and `/tag/<tag>` list them; `/graph` draws every note and link.

- Frontmatter, all required except tags and description: `title`, `description` (≤160 chars), `createdAt` and `updatedAt` (YYYY-MM-DD), `tags` (a list), `growthStage` (`seedling`, `budding` or `evergreen`). The Builder's "New Note" produces the same file at `src/content/wiki/notes/<slug>.md`.
- Link notes with `[[Note title]]`, `[[note-slug]]`, `[[slug|shown text]]` or `[[slug#heading]]`; a wikilink resolves by the target file's name, in any folder. The linked note shows this one under "Linked from"; both appear in the graph. Prefer wikilinks over `/wiki/…` paths.
- Bump `updatedAt` and, when a note has been revisited and holds, its `growthStage`. Keep stages honest: an evergreen note is one others may safely link to.
- Site identity (name, tagline, gardener, public address) lives in `src/config.json`; the person edits it as a form, so keep its JSON shape intact.
- Layouts in `src/layouts`, the wiki components in `src/components/wiki`, styles in `src/assets/styles`. The link index is `src/lib/wiki/links.mjs`; `UPSTREAM.md` says what is Veka's and what was added.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.
