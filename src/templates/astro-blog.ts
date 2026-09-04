import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';

/**
 * Astro Blog — a real Astro project (Site Crux, desktop only).
 * The workshop runs `astro dev` for live preview; publish runs `astro build`
 * and ships dist/. The folder is an ordinary Astro project: it works in any
 * editor and `pnpm dev` works in a terminal.
 */
const template: TemplateDefinition = {
  context:
    'This is a real Astro project (a Site Crux). Source lives in src/: pages in src/pages ' +
    '(Astro routing — index.astro is /, posts/*.md become /posts/*), layouts in src/layouts. ' +
    'Posts are markdown files with title/date/description frontmatter in src/pages/posts/. ' +
    'The preview is a live astro dev server with hot reload. node_modules and dist are ' +
    'managed by the app — never create or edit files there. To add a post, create a new ' +
    '.md file in src/pages/posts/ with frontmatter. Styling lives in src/styles/global.css.',
  greeting:
    "I've set up a real Astro blog — index page listing your posts, two sample posts in " +
    "src/pages/posts/, and clean typography. The preview runs Astro's dev server with hot " +
    'reload, and this folder is a genuine Astro project you can also open in any editor. ' +
    'Ask me to write a post, change the design, or restructure anything.',
  // Non-technical-first: chat + workshop only. Artifacts/file tree is one
  // TopBar toggle away for people who want to drop down to the real project.
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
          { key: 'date', label: 'Date', type: 'text', placeholder: '2026-07-04' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One-line summary shown on the index',
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
        { key: 'title', label: 'Blog Title', type: 'text', placeholder: 'My Blog' },
        {
          key: 'description',
          label: 'Tagline',
          type: 'text',
          placeholder: 'Thoughts, ideas, and stories',
        },
        { key: 'author', label: 'Author', type: 'text', placeholder: 'Your name' },
        { key: 'accent', label: 'Accent Color', type: 'color' },
      ],
    },
    actions: [
      {
        label: 'Draft a post',
        icon: '🪄',
        do: { type: 'ai', prompt: 'Write a new blog post about ' },
      },
      { label: 'Restyle my blog', icon: '🎨', do: { type: 'ai', prompt: 'Restyle my blog: ' } },
    ],
  },
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "astro-blog",
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
  "title": "My Blog",
  "description": "Thoughts, ideas, and stories",
  "author": "",
  "accent": "#3a7d5c"
}
`,
    },
    {
      path: 'public/favicon.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M16 28c0-8 0-12 0-14" stroke="#3a7d5c" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M16 16c0-5 3.5-8 8-8 0 5-3.5 8-8 8z" fill="#3a7d5c"/>
  <path d="M16 20c0-4-3-6.5-7-6.5 0 4 3 6.5 7 6.5z" fill="#5aa37c"/>
</svg>
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
      content: `:root {
  --bg: #faf8f5;
  --text: #2b2a27;
  --muted: #8a857c;
  --accent: #3a7d5c; /* overridden by config.json via Base layout */
  --max-width: 42rem;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.7;
}

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 3rem 1.25rem 6rem;
}

a { color: var(--accent); }
h1, h2, h3 { line-height: 1.25; }

header.site {
  margin-bottom: 3rem;
}
header.site h1 { margin: 0; font-size: 1.75rem; }
header.site p { margin: 0.25rem 0 0; color: var(--muted); }

ul.posts { list-style: none; padding: 0; }
ul.posts li { margin-bottom: 1.75rem; }
ul.posts .date { color: var(--muted); font-size: 0.85rem; }
ul.posts a { font-size: 1.15rem; text-decoration: none; }
ul.posts a:hover { text-decoration: underline; }
ul.posts p { margin: 0.25rem 0 0; color: var(--muted); }

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
const { title = config.title, description = config.description } = Astro.props;
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
  <nav class="back"><a href={import.meta.env.BASE_URL}>← All posts</a></nav>
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

const posts = Object.values(
  import.meta.glob('./posts/*.md', { eager: true }),
)
  .filter((post) => !post.frontmatter.draft)
  .sort(
    (a, b) => new Date(b.frontmatter.date).valueOf() - new Date(a.frontmatter.date).valueOf(),
  );
---

<Base>
  <header class="site">
    <h1>{config.title}</h1>
    <p>{config.description}</p>
  </header>

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
</Base>
`,
    },
    {
      path: 'src/pages/posts/hello-world.md',
      content: `---
layout: ../../layouts/PostLayout.astro
title: Hello, world
date: 2026-07-01
description: The obligatory first post — why this blog exists.
---

Every blog starts somewhere, and this one starts here.

This post is a real markdown file at \`src/pages/posts/hello-world.md\`. Edit it,
and the preview updates instantly. Add a new \`.md\` file next to it and it appears
on the index automatically.

## What works out of the box

- **Markdown posts** with frontmatter (title, date, description)
- **Automatic index** sorted by date
- **Hot reload** — this is Astro's own dev server
- **Real files** — open this folder in any editor, or ask the AI to write for you
`,
    },
    {
      path: 'src/pages/posts/second-post.md',
      content: `---
layout: ../../layouts/PostLayout.astro
title: Writing with an AI in the room
date: 2026-07-03
description: Notes on collaborating with a machine that never sleeps.
---

Ask the AI to draft a post and it writes a markdown file right into
\`src/pages/posts/\`. Ask it to restyle the blog and it edits the CSS.
Everything it does — and everything you do — lands in version history.

Delete this post whenever you're ready to make this blog yours.
`,
    },
  ],
};

export default template;
