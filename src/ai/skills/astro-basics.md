# Skill: astro-basics
Use when: working in any Site Crux — an Astro project with a build step (astro.config.* present).

This crux is a real toolchain project, NOT a browser-only static site. What that changes:

- Source lives in `src/`: pages in `src/pages` (file-based routing — `index.astro` is `/`, `posts/*.md` become `/posts/*`), layouts in `src/layouts`, components in `src/components`, styles in `src/styles`. Static assets (favicon, images, media) go in `public/` and are served from `/`.
- Write real `.astro`, `.md`, `.ts` and framework files as the project calls for — the toolchain compiles them. Do NOT use esm.sh import maps, CDN script tags for npm packages, or `React.createElement` workarounds here; those are for cruxes without a build step.
- Add dependencies to `package.json` — the app runs `pnpm install` automatically. NEVER create or edit `node_modules/`, `dist/` or `.astro/`; they are build machinery managed by the app.
- Astro basics: component script goes between `---` fences at the top of `.astro` files; markdown frontmatter references its layout by relative path (e.g. `layout: ../../layouts/PostLayout.astro`); use `import.meta.glob` for content listings; `Astro.props` carries frontmatter into a layout.
- Markdown content needs correct frontmatter. When the workspace context includes a Content Model, follow its collections and new-item recipes exactly — the Builder UI and your files must agree.
- The preview is the project's own `astro dev` server with hot reload. Publish runs the production build and ships `dist/` — a broken build blocks publishing, so keep the project building; prefer small, verifiable changes.
- After changes that could break the build (config, layouts, frontmatter, dependencies), run `check_site` when it is available and fix any errors it reports before telling the user you are done.
