# Skill: feed
Use when: the crux grew from the Feed template (a photo feed with a grid and per-photo pages).

A photo feed built as an Astro Site Crux. The grid is `src/pages/index.astro`; each post is a markdown file in `src/pages/p/` with frontmatter `title`, `date`, `image` and `caption`, living at `/p/<slug>`.

- `image` is a path under `public/`, e.g. `/images/sunset.jpg`. Images go in `public/images/`.
- To add a post: put the image in `public/images/` and create `src/pages/p/<slug>.md` pointing at it — the same result as the Builder's "Add photos".
- Profile identity (name, handle, bio, avatar, accent) is `src/config.json`; the person edits it as a form, so keep its JSON shape exactly.
- Layouts are in `src/layouts`, styles in `src/styles/global.css`.
- `node_modules/` and `dist/` are managed by the app — never create or edit files there.
