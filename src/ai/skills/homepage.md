# Skill: homepage
Use when: the crux grew from the Home Page template (a personal site with works and writing).

A personal home page built as an Astro Site Crux on the Astro Keel theme (MIT). The front page shows the person's name, tagline and about text, then the latest works and posts; `/about/`, `/works/`, `/blog/`, `/search/` and `/rss.xml` come with it.

- Identity (name, tagline, about, public address, footer line, locale) lives in `src/config.json`; the person edits it as a form, so keep its JSON shape intact. Header links are `NAV_ITEMS` in `src/consts.ts`; the about page is `src/pages/about/index.astro`.
- Posts are Markdown files under `src/content/blog/` (`title`, `description`, `publishDate` as an ISO time, optional `tags` list, `draft`, `heroImage` beside the file); each becomes `/blog/<slug>`. The Builder's "New Post" produces the same file.
- Works are Markdown files under `src/content/works/` (`title`, `description`, `publishDate`, optional `tech` list, `link`, `repo`, `thumbnail`, `order`); each becomes `/works/<slug>`. The Builder's "New Work" produces the same file.
- Layouts in `src/layouts`, components in `src/components`, styles in `src/styles/global.css` (the accent colour is a CSS variable there), UI strings in `src/i18n`. `UPSTREAM.md` says what is the theme's and what was changed.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.
