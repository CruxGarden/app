import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

/**
 * Empty (Astro) — the smallest real Astro project (Site Crux, desktop only):
 * one page, one stylesheet, a config, the ignore file. For people who know
 * what they want to build and just need the toolchain wired up.
 */
const template: TemplateDefinition = {
  skill: 'astro-basics',
  greeting:
    "An empty Astro project, wired up and running — one page, nothing else. Tell me what we're " +
    'building and I will lay out the pages.',
  layout: LAYOUT_BALANCED,
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "astro-site",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^5.0.0"
  }
}
`,
    },
    {
      path: 'astro.config.mjs',
      content: `import { defineConfig } from 'astro/config';

export default defineConfig({});
`,
    },
    {
      path: '.cruxignore',
      content: `# Files the app never versions (build machinery)
node_modules/
dist/
.astro/
`,
    },
    {
      path: 'src/styles/global.css',
      content: `:root { color-scheme: light dark; }
html, body { margin: 0; font: 16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 48px 20px; }
`,
    },
    {
      path: 'src/pages/index.astro',
      content: `---
import '../styles/global.css';
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New site</title>
  </head>
  <body>
    <main>
      <h1>Hello.</h1>
      <p>This is <code>src/pages/index.astro</code>. Edit it, or ask the AI what to build.</p>
    </main>
  </body>
</html>
`,
    },
  ],
};

export default template;
