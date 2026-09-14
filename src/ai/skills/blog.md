# Skill: blog
Use when: the crux grew from the Blog template (posts in content/posts).

A blog built as an Astro Site Crux on the Astro Cactus theme (MIT). Posts are Markdown files under `content/posts/` (a file, or a folder with an `index.md` and its images beside it); each becomes `/posts/<slug>`. Notes, the short form, live under `content/notes/` at `/notes/<slug>`; tags under `content/tags/` describe a tag at `/tags/<tag>`.

- A post's frontmatter: `title` (≤ 60 chars), `description`, `publishDate` (YYYY-MM-DD), optional `tags` (a list), `updatedDate`, `draft: true` to hide it, `pinned: true` to hold it at the top, `coverImage: { src, alt }` for a picture beside the file. The Builder's "New Post" produces the same file.
- A note's frontmatter: `title`, optional `description`, `publishDate` as a full ISO time (`2026-09-14T12:00:00Z`).
- Site identity (title, tagline, author, public address, language) lives in `src/config.json`; the person edits it as a form, so keep its JSON shape intact. Header and footer links are `menuLinks` in `src/site.config.ts`; the about page is `src/pages/about.astro`.
- Markdown is rich here: admonitions (`:::note`, `:::tip`…), footnotes, code blocks with titles and highlights, GitHub cards (`::github{repo="…"}` — this one fetches at build). See the "Markdown elements" post for every form.
- Layouts in `src/layouts`, components in `src/components`, styles in `src/styles`. `UPSTREAM.md` says what is the theme's and what was changed.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.
