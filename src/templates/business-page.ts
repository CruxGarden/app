import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The Business Page template (ADR 0006's bundled starter set): Foxi (MIT) as an
// Astro Site Crux. Text travels as text so the Crux is a plain Astro project in
// any editor; the images, icons and fonts as bytes.
const sources = import.meta.glob(
  [
    '../../business-crux/{astro.config.mjs,package.json,pnpm-lock.yaml,tsconfig.json,tailwind.config.mjs,postcss.config.mjs,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../business-crux/{src,public}/**/*',
    '!../../business-crux/**/node_modules/**',
    '!../../business-crux/**/*.{png,jpg,jpeg,webp,avif,ico,woff,woff2}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(
  [
    '../../business-crux/{src,public}/**/*.{png,jpg,jpeg,webp,avif,ico,woff,woff2}',
    '!../../business-crux/**/node_modules/**',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'business-page',
  greeting:
    'Your business site is up: a home page, what you do, pricing, questions, news and contact. The words are placeholders that say what belongs in each place rather than pretending to be a product — start with src/config.json to name the business, then the JSON files under src/data for what you do, your prices and the questions people ask. Share publishes it as a site.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'News',
        singular: 'Post',
        glob: 'src/content/blog/**/*.md',
        routeBase: '/blog/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Post title' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One line shown on the card and in search',
          },
          { key: 'pubDate', label: 'Published', type: 'text', placeholder: '2026-09-21' },
          { key: 'author', label: 'Author', type: 'text', placeholder: 'Your name' },
          {
            key: 'image',
            label: 'Cover image',
            type: 'text',
            placeholder: '/blog/post-01-cover.png',
          },
        ],
        new: {
          pathTemplate: 'src/content/blog/{slug}.md',
          frontmatter: {
            title: '{title}',
            pubDate: '{today}',
            description: '',
            author: '',
            image: '/blog/post-01-cover.png',
          },
          body: '\nWhat happened, and why it matters to the people who read this.\n',
        },
        sort: { field: 'pubDate', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'name', label: 'Business name', type: 'text', placeholder: 'My Business' },
        {
          key: 'description',
          label: 'One line',
          type: 'text',
          placeholder: 'What you do, in a sentence a stranger would understand',
        },
        {
          key: 'url',
          label: 'Public address',
          type: 'text',
          placeholder: 'https://… once shared (for canonical links)',
        },
      ],
    },
  },
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../business-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../business-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
