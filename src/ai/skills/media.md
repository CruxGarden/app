# Skill: media
Use when: the crux grew from the Media template (a page for sharing music and video).

A music and video page built as an Astro Site Crux. The list is `src/pages/index.astro`; each item is a markdown file in `src/pages/m/` with frontmatter `title`, `date`, `kind`, `media`, `cover` and `description`, living at `/m/<slug>`.

- `kind` is `"audio"` or `"video"`; `media` is a path under `public/` (e.g. `/media/song.m4a`); `cover` is an optional image under `public/images/`.
- Browsers play MP4 (H.264/AAC) and M4A reliably. The app transcodes other formats into `public/media/` when the person adds them with the Builder's "Add media" — point new items at the converted file.
- Site identity (name, tagline, accent) is `src/config.json`; the person edits it as a form, so keep its JSON shape exactly.
- `node_modules/` and `dist/` are managed by the app — never create or edit files there.
