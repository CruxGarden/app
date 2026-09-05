# Skill: homepage
Use when: the crux grew from the Home Page template (a personal home page with posts).

A personal home page built as an Astro Site Crux. The front page is `src/pages/index.astro` (hero, about, links, recent posts). Posts are markdown files with `title`, `date` and `description` frontmatter in `src/pages/posts/`; they appear on the front page automatically and live at `/posts/<slug>`.

- Site identity (name, tagline, about text, accent color, links) lives in `src/config.json`; the person edits it as a form, so keep its JSON shape intact.
- Layouts are in `src/layouts`, styles in `src/styles/global.css`.
- To add a post, create `src/pages/posts/<slug>.md` with frontmatter — the same file the Builder's "New Post" produces.
- `node_modules/` and `dist/` are managed by the app — never create or edit files there.
