# Skill: blog
Use when: the crux grew from the Blog template (posts in src/pages/posts).

A blog built as an Astro Site Crux. Posts are markdown files with `title`, `date` and `description` frontmatter in `src/pages/posts/`; each becomes `/posts/<slug>`. The front page (`src/pages/index.astro`) lists posts newest first.

- To add a post, create `src/pages/posts/<slug>.md` with frontmatter (`layout: ../../layouts/PostLayout.astro`, `title`, `date` as YYYY-MM-DD, `description`) and the body below it — the same file the Builder's "New Post" button produces.
- Layouts live in `src/layouts`; site-wide styling in `src/styles/global.css`.
- Keep dates real and unique; the listing sorts on them.
- `node_modules/` and `dist/` are managed by the app — never create or edit files there.
