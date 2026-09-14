import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The Home Page starter is Astro Keel (MIT) as a Site Crux: a personal site with
// works and writing, upstream's theme kept verbatim, the person's identity in
// src/config.json. Text travels as text so the Crux is a plain Astro project.
const sources = import.meta.glob(
  [
    '../../homepage-crux/{astro.config.mjs,package.json,pnpm-lock.yaml,remark-reading-time.mjs,tsconfig.json,.nvmrc,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../homepage-crux/{src,public}/**/*',
    '!../../homepage-crux/**/node_modules/**',
    '!../../homepage-crux/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(
  ['../../homepage-crux/{src,public}/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'homepage',
  greeting:
    'I’ve set up your home page on the Astro Keel theme: your name and tagline on the front, an about page, works and writing sections that fill in as you add them, search and a feed built in. Put your name in the site settings, add a post or a work from the Builder, or ask me to write one.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'Posts',
        singular: 'Post',
        glob: 'src/content/blog/**/*.md',
        routeBase: '/blog/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Post title' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One line shown on the home page and the list',
          },
          {
            key: 'publishDate',
            label: 'Date',
            type: 'text',
            placeholder: '2026-09-14T12:00:00Z',
          },
        ],
        new: {
          pathTemplate: 'src/content/blog/{slug}.md',
          frontmatter: { title: '{title}', description: '', publishDate: '{today}T12:00:00Z' },
          body: '\nWrite your post here.\n',
        },
        sort: { field: 'publishDate', dir: 'desc' },
      },
      {
        name: 'Works',
        singular: 'Work',
        glob: 'src/content/works/**/*.md',
        routeBase: '/works/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Project title' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'What it is, in one line',
          },
          {
            key: 'publishDate',
            label: 'Date',
            type: 'text',
            placeholder: '2026-09-14T12:00:00Z',
          },
        ],
        new: {
          pathTemplate: 'src/content/works/{slug}.md',
          frontmatter: { title: '{title}', description: '', publishDate: '{today}T12:00:00Z' },
          body: '\nWhat it is, what it was made with, where to find it.\n',
        },
        sort: { field: 'publishDate', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'name', label: 'Your Name', type: 'text', placeholder: 'Ada Lovelace' },
        { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'What you do, in one line' },
        { key: 'about', label: 'About', type: 'textarea', placeholder: 'A few lines about you' },
        {
          key: 'url',
          label: 'Public address',
          type: 'text',
          placeholder: 'https://… once shared (for canonical links, the feed and the sitemap)',
        },
        { key: 'footerText', label: 'Footer line', type: 'text', placeholder: 'Optional' },
      ],
    },
  },
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../homepage-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../homepage-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
