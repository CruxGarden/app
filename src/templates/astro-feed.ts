import type { TemplateDefinition } from './index';
import { LAYOUT_VISUAL } from './index';

/**
 * Astro Feed — an Instagram-style photo feed (Site Crux, desktop only).
 * A profile header, a square grid of posts, one page per post with the image
 * large and the caption under it. Posts are markdown files whose frontmatter
 * points at an image in public/images/. "Add images" uploads there; the AI
 * or the New post button makes the post.
 */
const template: TemplateDefinition = {
  skill: 'feed',
  greeting:
    "I've set up your feed — a profile header, a square grid, and a page for every post. Add " +
    'images with the button, then make a post for each (or ask me to). Change your name, ' +
    'handle and colors in the settings form, or ask me to restyle the whole thing.',
  layout: LAYOUT_VISUAL,
  contentModel: {
    collections: [
      {
        name: 'Posts',
        singular: 'Post',
        glob: 'src/pages/p/*.md',
        routeBase: '/p/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Golden hour' },
          { key: 'date', label: 'Date', type: 'text', placeholder: '2026-07-04' },
          { key: 'image', label: 'Image', type: 'image', placeholder: '/images/golden-hour.jpg' },
          {
            key: 'caption',
            label: 'Caption',
            type: 'textarea',
            placeholder: 'What is this a picture of?',
          },
        ],
        new: {
          pathTemplate: 'src/pages/p/{slug}.md',
          frontmatter: {
            layout: '../../layouts/PostLayout.astro',
            title: '{title}',
            date: '{today}',
            image: '',
            caption: '',
          },
          body: '\n',
        },
        sort: { field: 'date', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Your name' },
        { key: 'handle', label: 'Handle', type: 'text', placeholder: 'yourname' },
        { key: 'bio', label: 'Bio', type: 'textarea', placeholder: 'A line about you' },
        { key: 'avatar', label: 'Avatar', type: 'image', placeholder: '/images/avatar.jpg' },
        { key: 'accent', label: 'Accent Color', type: 'color' },
      ],
    },
    actions: [{ label: 'Add photos', icon: '📷', do: { type: 'add-photos', collection: 'Posts' } }],
  },
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "astro-feed",
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
  "handle": "yourname",
  "bio": "Pictures from the garden.",
  "avatar": "/images/avatar.svg",
  "accent": "#d96c3f"
}
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
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="7" fill="none" stroke="#d96c3f" stroke-width="2.5"/><circle cx="16" cy="16" r="6" fill="none" stroke="#d96c3f" stroke-width="2.5"/><circle cx="23" cy="9" r="1.6" fill="#d96c3f"/></svg>
`,
    },
    {
      path: 'public/images/avatar.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#2b2b2b"/><circle cx="48" cy="38" r="16" fill="#d96c3f"/><path d="M16 88c4-18 18-26 32-26s28 8 32 26" fill="#d96c3f"/></svg>
`,
    },
    {
      path: 'public/images/sample-morning.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7c59f"/><stop offset="1" stop-color="#d96c3f"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="400" cy="520" r="160" fill="#fff3e0" opacity=".9"/><rect y="600" width="800" height="200" fill="#3b2a24"/></svg>
`,
    },
    {
      path: 'public/images/sample-leaves.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#1f3a2a"/><g fill="#5aa37c"><ellipse cx="300" cy="380" rx="120" ry="220" transform="rotate(-30 300 380)"/><ellipse cx="500" cy="420" rx="120" ry="220" transform="rotate(25 500 420)"/></g><ellipse cx="400" cy="560" rx="110" ry="200" fill="#8fd19e"/></svg>
`,
    },
    {
      path: 'src/styles/global.css',
      content: `:root {
  --bg: #0f0f10;
  --fg: #f2f2f2;
  --muted: #9a9a9a;
  --line: #262626;
  --accent: var(--feed-accent, #d96c3f);
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
a { color: inherit; text-decoration: none; }
main { max-width: 935px; margin: 0 auto; padding: 32px 16px 64px; }
.profile { display: flex; align-items: center; gap: 28px; padding-bottom: 28px; border-bottom: 1px solid var(--line); }
.profile img { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent); }
.profile h1 { margin: 0; font-size: 22px; font-weight: 600; }
.profile .handle { color: var(--muted); font-size: 14px; }
.profile .bio { margin: 6px 0 0; color: var(--fg); }
.profile .count { color: var(--muted); font-size: 14px; margin-top: 4px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 4px; }
@media (min-width: 640px) { .grid { gap: 12px; margin-top: 28px; } }
.tile { position: relative; aspect-ratio: 1; overflow: hidden; background: #1b1b1b; display: block; }
.tile img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s ease; }
.tile:hover img { transform: scale(1.03); }
.tile .caption { position: absolute; inset: auto 0 0 0; padding: 10px; font-size: 13px; background: linear-gradient(transparent, rgba(0,0,0,.7)); opacity: 0; transition: opacity .2s; }
.tile:hover .caption { opacity: 1; }
.post { max-width: 640px; margin: 0 auto; }
.post img { width: 100%; border-radius: 6px; display: block; }
.post .meta { display: flex; justify-content: space-between; color: var(--muted); font-size: 13px; margin: 12px 0 6px; }
.post h1 { font-size: 20px; margin: 0 0 6px; }
.post .caption { white-space: pre-wrap; }
.back { display: inline-block; margin-bottom: 18px; color: var(--muted); font-size: 14px; }
.back:hover { color: var(--accent); }
.empty { padding: 64px 0; text-align: center; color: var(--muted); }
`,
    },
    {
      path: 'src/layouts/Base.astro',
      content: `---
import '../styles/global.css';
import config from '../config.json';
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" />
    <title>{title ? title + ' · ' : ''}{config.name}</title>
    <style define:vars={{ 'feed-accent': config.accent }}></style>
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
<Base title={frontmatter.title}>
  <article class="post">
    <a class="back" href="/">← back to the feed</a>
    {frontmatter.image && <img src={frontmatter.image} alt={frontmatter.title} />}
    <div class="meta"><span>{date}</span></div>
    <h1>{frontmatter.title}</h1>
    {frontmatter.caption && <p class="caption">{frontmatter.caption}</p>}
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

const posts = Object.values(import.meta.glob('./p/*.md', { eager: true }))
  .filter((p) => !p.frontmatter.draft)
  .sort((a, b) => new Date(b.frontmatter.date).valueOf() - new Date(a.frontmatter.date).valueOf());
---

<Base>
  <header class="profile">
    {config.avatar && <img src={config.avatar} alt="" />}
    <div>
      <h1>{config.name}</h1>
      <div class="handle">@{config.handle}</div>
      <p class="bio">{config.bio}</p>
      <div class="count">{posts.length} post{posts.length === 1 ? '' : 's'}</div>
    </div>
  </header>

  {posts.length === 0 ? (
    <p class="empty">No posts yet. Add an image and make your first post.</p>
  ) : (
    <div class="grid">
      {posts.map((post) => (
        <a class="tile" href={post.url + '/'}>
          {post.frontmatter.image && <img src={post.frontmatter.image} alt={post.frontmatter.title} loading="lazy" />}
          <div class="caption">{post.frontmatter.title}</div>
        </a>
      ))}
    </div>
  )}
</Base>
`,
    },
    {
      path: 'src/pages/p/morning.md',
      content: `---
layout: ../../layouts/PostLayout.astro
title: Morning light
date: 2026-07-02
image: /images/sample-morning.svg
caption: First light over the back fence. Replace this image with one of yours — drop it in public/images and point the post at it.
---
`,
    },
    {
      path: 'src/pages/p/leaves.md',
      content: `---
layout: ../../layouts/PostLayout.astro
title: New leaves
date: 2026-07-01
image: /images/sample-leaves.svg
caption: Three weeks after planting. This post is a markdown file in src/pages/p/ — ask the AI to write captions, or edit it yourself.
---
`,
    },
  ],
};

export default template;
