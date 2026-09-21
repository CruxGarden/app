# Skill: resume
Use when: the crux grew from the Resume template (a one-page resume).

A one-page resume built as an Astro Site Crux on the astro-resume theme. **The whole resume is `src/pages/index.md`** — there is no data file and no collection.

- Frontmatter: `title`, `description`, `layout` (leave it pointing at `../layouts/Minimalist.astro`). Do not add `pdfLink`; it was removed with the PDF build.
- The structure is headings: `#` the person's name, `**bold**` under it for what they do, then a contact line, then `##` sections — Work Experience, Projects, Education, Skills. `###` is an employer or project, `####` a role with its dates. Keep that shape; the layout's styling depends on it.
- Write outcomes, not duties, and put a number in where the person has one. Older roles get shorter. A resume that runs to two pages has usually lost something worth cutting.
- **Saving a PDF is printing.** The button at the top right calls `window.print()`, and the print rules in `src/styles.css` are what make the page come out clean. If you change the layout, check it still prints to one page.
- Light and dark both ship; the toggle is upstream's and remembers the choice.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.
