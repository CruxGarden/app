import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';

/**
 * Astro Home Page — a general-purpose personal site (Site Crux, desktop only).
 * A hero + about + links front page with a posts section riding along, so the
 * same crux grows from "my page on the internet" into "my page with writing".
 * The workshop runs `astro dev` for live preview; publish runs `astro build`
 * and ships dist/.
 */
const template: TemplateDefinition = {
  context:
    'This is a real Astro project (a Site Crux) — a personal home page. Source lives in src/: ' +
    'the front page is src/pages/index.astro (hero, about, links, recent posts), posts are ' +
    'markdown files with title/date/description frontmatter in src/pages/posts/ (they appear ' +
    'on the front page automatically and live at /posts/<slug>). Site identity (name, tagline, ' +
    'about text, accent color, links) lives in src/config.json — the user edits it as a form, ' +
    'so keep its JSON shape intact. Layouts are in src/layouts, styles in src/styles/global.css. ' +
    'The preview is a live astro dev server with hot reload. node_modules and dist are managed ' +
    'by the app — never create or edit files there.',
  greeting:
    "I've set up your home page — a hero with your name and tagline, an about section, a links " +
    'row, and a posts section that fills in as you write. Everything is a real Astro project: ' +
    'edit src/config.json (or use the form) for your name and colors, ask me to restyle ' +
    'anything, or ask me to write your first post.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'Posts',
        singular: 'Post',
        glob: 'src/pages/posts/*.md',
        routeBase: '/posts/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Post title' },
          { key: 'date', label: 'Date', type: 'text', placeholder: '2026-07-31' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One-line summary shown on the home page',
          },
        ],
        new: {
          pathTemplate: 'src/pages/posts/{slug}.md',
          frontmatter: {
            layout: '../../layouts/PostLayout.astro',
            title: '{title}',
            date: '{today}',
            description: '',
          },
          body: '\nWrite your post here.\n',
        },
        sort: { field: 'date', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'name', label: 'Your Name', type: 'text', placeholder: 'Ada Lovelace' },
        {
          key: 'tagline',
          label: 'Tagline',
          type: 'text',
          placeholder: 'What you do, in one line',
        },
        {
          key: 'about',
          label: 'About',
          type: 'textarea',
          placeholder: 'A short paragraph about you',
        },
        { key: 'accent', label: 'Accent Color', type: 'color' },
      ],
    },
    actions: [
      {
        label: 'Write a post with AI',
        icon: '🪄',
        do: { type: 'ai', prompt: 'Write a new post about ' },
      },
      {
        label: 'Restyle my page',
        icon: '🎨',
        do: { type: 'ai', prompt: 'Restyle my home page: ' },
      },
      { label: 'Edit my links', icon: '🔗', do: { type: 'open-file', path: 'src/links.json' } },
    ],
  },
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "astro-homepage",
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
      path: 'src/config.json',
      content: `{
  "name": "Your Name",
  "tagline": "Making things on the internet",
  "about": "Hi — this is my corner of the web. I write, make things, and put them here.",
  "accent": "#3a7d5c"
}
`,
    },
    {
      path: 'src/links.json',
      content: `[
  { "label": "Email", "url": "mailto:you@example.com" },
  { "label": "GitHub", "url": "https://github.com/you" }
]
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
      path: 'public/favicon.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="13" fill="none" stroke="#3a7d5c" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="4.5" fill="#5aa37c"/>
</svg>
`,
    },
    {
      path: 'src/styles/global.css',
      content: `:root {
  --bg: #fbfaf7;
  --text: #26251f;
  --muted: #8b8578;
  --accent: #3a7d5c; /* overridden by config.json via Base layout */
  --max-width: 40rem;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, system-ui, 'Segoe UI', sans-serif;
  line-height: 1.7;
}

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 4rem 1.25rem 6rem;
}

a { color: var(--accent); }
h1, h2, h3 { line-height: 1.2; }

header.hero h1 {
  margin: 0;
  font-size: 2.25rem;
  letter-spacing: -0.02em;
}
header.hero p.tagline {
  margin: 0.5rem 0 0;
  font-size: 1.1rem;
  color: var(--muted);
}

section { margin-top: 3rem; }
section > h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  margin-bottom: 1rem;
}

nav.links { display: flex; flex-wrap: wrap; gap: 0.75rem; }
nav.links a {
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--accent);
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.9rem;
}
nav.links a:hover { background: var(--accent); color: var(--bg); }

ul.posts { list-style: none; padding: 0; margin: 0; }
ul.posts li { margin-bottom: 1.5rem; }
ul.posts .date { color: var(--muted); font-size: 0.85rem; }
ul.posts a { font-size: 1.1rem; text-decoration: none; }
ul.posts a:hover { text-decoration: underline; }
ul.posts p { margin: 0.25rem 0 0; color: var(--muted); }
p.empty-posts { color: var(--muted); }

article .date { color: var(--muted); font-size: 0.9rem; }
article img { max-width: 100%; }
nav.back { margin-bottom: 2rem; font-size: 0.9rem; }
`,
    },
    {
      path: 'src/layouts/Base.astro',
      content: `---
import config from '../config.json';
import '../styles/global.css';
const { title = config.name, description = config.tagline } = Astro.props;
---

<!doctype html>
<html lang="en" style={\`--accent: \${config.accent || '#3a7d5c'}\`}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
  </head>
  <body>
    <main>
      <slot />
    </main>
  </body>
</html>
`,
    },
    {
      path: 'src/layouts/PostLayout.astro',
      content: `---
import Base from './Base.astro';
const { frontmatter } = Astro.props;
const date = new Date(frontmatter.date).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});
---

<Base title={frontmatter.title} description={frontmatter.description}>
  <nav class="back"><a href={import.meta.env.BASE_URL}>← Home</a></nav>
  <article>
    <h1>{frontmatter.title}</h1>
    <p class="date">{date}</p>
    <slot />
  </article>
</Base>
`,
    },
    {
      path: 'src/pages/index.astro',
      content: `---
import Base from '../layouts/Base.astro';
import config from '../config.json';
import links from '../links.json';

const posts = Object.values(
  import.meta.glob('./posts/*.md', { eager: true }),
)
  .filter((post) => !post.frontmatter.draft)
  .sort(
    (a, b) => new Date(b.frontmatter.date).valueOf() - new Date(a.frontmatter.date).valueOf(),
  );
---

<Base>
  <header class="hero">
    <h1>{config.name}</h1>
    <p class="tagline">{config.tagline}</p>
  </header>

  <section>
    <h2>About</h2>
    <p>{config.about}</p>
  </section>

  {links.length > 0 && (
    <section>
      <h2>Links</h2>
      <nav class="links">
        {links.map((link) => (
          <a href={link.url}>{link.label}</a>
        ))}
      </nav>
    </section>
  )}

  <section>
    <h2>Writing</h2>
    {posts.length === 0 && <p class="empty-posts">Nothing here yet — the first post is coming.</p>}
    <ul class="posts">
      {
        posts.map((post) => (
          <li>
            <span class="date">
              {new Date(post.frontmatter.date).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
              })}
            </span>
            <br />
            <a href={post.url + '/'}>{post.frontmatter.title}</a>
            <p>{post.frontmatter.description}</p>
          </li>
        ))
      }
    </ul>
  </section>
</Base>
`,
    },
    {
      path: 'src/pages/posts/hello.md',
      content: `---
layout: ../../layouts/PostLayout.astro
title: Hello from my new home page
date: 2026-07-01
description: The first post — what this place is for.
---

This site is a real Astro project living in Crux Garden. This post is a real
markdown file at \`src/pages/posts/hello.md\` — edit it, and the preview updates
instantly. Add another \`.md\` file next to it (or ask the AI to write one) and
it appears in the Writing section automatically.

Delete this post whenever you're ready to make the page yours.
`,
    },
  ],
};

export default template;
