# Upstream: astro-resume

- Source: https://github.com/EmaSuriano/astro-resume — "resume builder written
  in Markdown using Astro with Tailwind" by Ema Suriano.
- Pinned: commit `8daebab` (2026-09-06). Licence: the README states MIT; the
  repository ships no `LICENSE` file, which Daniel judged sufficient
  (2026-09-21). If one appears upstream, add it here verbatim.
- Astro `^7.3.1`, Tailwind 4, `@fontsource/poppins`. Two runtime dependencies.

Chosen because every other Astro CV theme found in the 2026 survey sits on
Astro 2–4 and has not moved since 2024 (see ROADMAP § The Astro starter set).

## What is upstream, unchanged

`src/layouts/Minimalist.astro` (minus the PDF plumbing), `src/components/ThemeToggle.astro`,
`src/styles.css` — including the print rules that make the page come out as one
clean sheet — and `tsconfig.json`. The design is Ema Suriano's.

## What Crux Garden changed

- **No Playwright.** Upstream generates the PDF at build time by driving a real
  browser: `postinstall` ran `npx playwright install` and `build` ran a server
  plus a headless browser. In a template that would download a browser into
  every new crux. Both are gone, along with the Netlify plugins.
- **The download button prints instead.** It pointed at a `resume.pdf` that is
  no longer generated; it now calls `window.print()`, which saves a PDF through
  the browser's own dialogue and uses the same print styles. `pdfLink` is gone
  from the layout and the page's frontmatter.
- **The content is a scaffold, not a person.** Upstream ships a resume for a
  fictional character; `src/pages/index.md` is now headings and prompts that say
  what belongs in each section.
- `.cruxignore` keeps `node_modules/`, `dist/` and `.astro/` out of Growth.

Tests: `npx astro build` (1 page) after `npm install`;
`e2e/resume.spec.ts` drives the journey in the app.
