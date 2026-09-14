# Skill: recipes
Use when: the crux grew from the Recipe Book template.

A recipe book built as an Astro Site Crux on the Astro Keel theme (MIT) with a recipes collection. Recipes are Markdown files under `src/content/recipes/`; each becomes `/recipes/<slug>` with the facts up top, a tickable ingredient list, numbered steps, a Print recipe button and a social card. `/recipes/` groups them by category; the front page shows the latest six.

- Frontmatter: `title`, `description`, `publishDate` (ISO time), `prepTime` and `cookTime` in minutes, `servings`, `category` (Soups, Mains, Baking… free text), optional `tags` (a list), `image` (a picture beside the file), `draft: true` to hide. The Builder's "New Recipe" produces the same file.
- The body carries two headings the page relies on: `## Ingredients` with one item per list line (quantity first: "2 tbsp olive oil"), then `## Method` with numbered steps. Keep steps short and in cooking order; put temperatures and times in the step that needs them.
- Posts (`src/content/blog/`) are for the stories around the food; same shape as the Home Page's posts.
- Identity (book name, tagline, about, public address, footer) lives in `src/config.json`; keep its JSON shape intact. Layouts in `src/layouts`, styles in `src/styles/global.css`, the recipe page in `src/pages/recipes/[slug].astro`. `UPSTREAM.md` says what is the theme's and what was added.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.
