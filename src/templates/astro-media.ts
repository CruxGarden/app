import type { TemplateDefinition } from './index';
import { LAYOUT_VISUAL } from './index';

/**
 * Astro Media — share music and video (Site Crux, desktop only).
 * A list of tracks and videos with inline players, one page per item.
 * Items are markdown files pointing at a file in public/media/. "Add media"
 * in the Builder uploads the file, transcodes it with ffmpeg when the browser
 * couldn't play the original (MOV, WAV, FLAC…), and writes the item.
 */
const template: TemplateDefinition = {
  context:
    'This is a real Astro project (a Site Crux) — a page for sharing music and video. Source ' +
    'lives in src/: the list is src/pages/index.astro, each item is a markdown file in ' +
    'src/pages/m/ with frontmatter title/date/kind/media/cover/description — kind is "audio" or ' +
    '"video", media is a path under public/ (e.g. /media/song.m4a), cover an optional image ' +
    'under public/images/. Items live at /m/<slug>. Site identity (name, tagline, accent) is ' +
    'src/config.json — the user edits it as a form, keep its JSON shape. Browsers play MP4 ' +
    '(H.264/AAC) and M4A reliably; the app transcodes other formats into public/media/ when ' +
    'the user adds them with the Builder. node_modules and dist are managed by the app — ' +
    'never create or edit files there.',
  greeting:
    "I've set up your media page — a list with players for every track and video, and a page " +
    'for each. Use “Add media” to bring in audio or video files; anything the browser cannot ' +
    'play gets converted automatically. Ask me to write descriptions, add a cover, or restyle it.',
  layout: LAYOUT_VISUAL,
  contentModel: {
    collections: [
      {
        name: 'Media',
        singular: 'Item',
        glob: 'src/pages/m/*.md',
        routeBase: '/m/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Track or video title' },
          { key: 'date', label: 'Date', type: 'text', placeholder: '2026-07-04' },
          {
            key: 'kind',
            label: 'Kind',
            type: 'select',
            options: [
              { label: 'Audio', value: 'audio' },
              { label: 'Video', value: 'video' },
            ],
          },
          { key: 'media', label: 'File', type: 'text', placeholder: '/media/song.m4a' },
          { key: 'cover', label: 'Cover image', type: 'image', placeholder: '/images/cover.jpg' },
          {
            key: 'description',
            label: 'Description',
            type: 'textarea',
            placeholder: 'A few words about it',
          },
        ],
        new: {
          pathTemplate: 'src/pages/m/{slug}.md',
          frontmatter: {
            layout: '../../layouts/ItemLayout.astro',
            title: '{title}',
            date: '{today}',
            kind: 'audio',
            media: '',
            cover: '',
            description: '',
          },
          body: '\n',
        },
        sort: { field: 'date', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Your name or band' },
        { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Songs and films' },
        { key: 'accent', label: 'Accent Color', type: 'color' },
      ],
    },
    actions: [{ label: 'Add media', icon: '🎬', do: { type: 'add-media', collection: 'Media' } }],
  },
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "astro-media",
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
  "tagline": "Songs, sketches and short films",
  "accent": "#5b8def"
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
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="none" stroke="#5b8def" stroke-width="2.5"/><path d="M13 10l9 6-9 6z" fill="#5b8def"/></svg>
`,
    },
    {
      path: 'public/media/.gitkeep',
      content: `Media files (M4A audio, MP4 video) live here. "Add media" in the Builder puts them here for you.
`,
    },
    {
      path: 'src/styles/global.css',
      content: `:root {
  --bg: #0c0d10;
  --fg: #ececf1;
  --muted: #8b8f9a;
  --line: #22252c;
  --card: #14161b;
  --accent: var(--media-accent, #5b8def);
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
a { color: inherit; text-decoration: none; }
main { max-width: 760px; margin: 0 auto; padding: 40px 16px 80px; }
header.site h1 { margin: 0; font-size: 28px; letter-spacing: -0.01em; }
header.site p { margin: 4px 0 0; color: var(--muted); }
.items { list-style: none; padding: 0; margin: 32px 0 0; display: grid; gap: 16px; }
.item { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: grid; grid-template-columns: 72px 1fr; gap: 16px; align-items: start; }
.item.video { grid-template-columns: 1fr; }
.cover { width: 72px; height: 72px; border-radius: 6px; object-fit: cover; background: #1d2027; }
.cover.placeholder { display: grid; place-items: center; color: var(--accent); font-size: 26px; }
.item h2 { margin: 0 0 2px; font-size: 17px; }
.item h2 a:hover { color: var(--accent); }
.item .meta { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
.item p { margin: 0 0 8px; color: var(--fg); }
audio, video { width: 100%; display: block; border-radius: 6px; accent-color: var(--accent); }
video { background: #000; aspect-ratio: 16 / 9; }
.pending { color: var(--muted); font-size: 13px; font-style: italic; }
.back { display: inline-block; margin-bottom: 18px; color: var(--muted); font-size: 14px; }
.back:hover { color: var(--accent); }
.detail h1 { margin: 12px 0 4px; }
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
    <style define:vars={{ 'media-accent': config.accent }}></style>
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
      path: 'src/components/Player.astro',
      content: `---
// One player for either kind. Missing media shows a quiet note instead of a broken control.
const { kind, media, title, cover } = Astro.props;
---
{media ? (
  kind === 'video' ? (
    <video controls preload="metadata" poster={cover || undefined} src={media}></video>
  ) : (
    <audio controls preload="metadata" src={media}></audio>
  )
) : (
  <p class="pending">No file yet — use “Add media” or set <code>media</code> in this item's frontmatter.</p>
)}
`,
    },
    {
      path: 'src/layouts/ItemLayout.astro',
      content: `---
import Base from './Base.astro';
import Player from '../components/Player.astro';
const { frontmatter } = Astro.props;
const date = new Date(frontmatter.date).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});
---
<Base title={frontmatter.title}>
  <article class="detail">
    <a class="back" href="/">← all media</a>
    <Player kind={frontmatter.kind} media={frontmatter.media} title={frontmatter.title} cover={frontmatter.cover} />
    <h1>{frontmatter.title}</h1>
    <div class="meta">{date}</div>
    {frontmatter.description && <p>{frontmatter.description}</p>}
    <slot />
  </article>
</Base>
`,
    },
    {
      path: 'src/pages/index.astro',
      content: `---
import Base from '../layouts/Base.astro';
import Player from '../components/Player.astro';
import config from '../config.json';

const items = Object.values(import.meta.glob('./m/*.md', { eager: true }))
  .filter((m) => !m.frontmatter.draft)
  .sort((a, b) => new Date(b.frontmatter.date).valueOf() - new Date(a.frontmatter.date).valueOf());
---

<Base>
  <header class="site">
    <h1>{config.name}</h1>
    <p>{config.tagline}</p>
  </header>

  {items.length === 0 ? (
    <p class="empty">Nothing here yet. Add a track or a video.</p>
  ) : (
    <ul class="items">
      {items.map((m) => (
        <li class={'item ' + (m.frontmatter.kind === 'video' ? 'video' : 'audio')}>
          {m.frontmatter.kind !== 'video' && (
            m.frontmatter.cover
              ? <img class="cover" src={m.frontmatter.cover} alt="" />
              : <div class="cover placeholder">♪</div>
          )}
          <div>
            <h2><a href={m.url + '/'}>{m.frontmatter.title}</a></h2>
            <div class="meta">
              {new Date(m.frontmatter.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
              {m.frontmatter.kind === 'video' ? ' · video' : ' · audio'}
            </div>
            {m.frontmatter.description && <p>{m.frontmatter.description}</p>}
            <Player kind={m.frontmatter.kind} media={m.frontmatter.media} title={m.frontmatter.title} cover={m.frontmatter.cover} />
          </div>
        </li>
      ))}
    </ul>
  )}
</Base>
`,
    },
    {
      path: 'src/pages/m/welcome.md',
      content: `---
layout: ../../layouts/ItemLayout.astro
title: Your first track goes here
date: 2026-07-01
kind: audio
media: ''
cover: ''
description: Click “Add media” in the Builder and pick an audio or video file. MOV, WAV, FLAC and friends are converted so every browser can play them. Then delete this placeholder.
---
`,
    },
  ],
};

export default template;
