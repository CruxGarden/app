import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The Blog starter is Astro Cactus (MIT) as a Site Crux: upstream's theme kept
// verbatim, the blog's identity in src/config.json, seed content of our own.
// Text travels as text so the Crux is a plain Astro project in any editor.
const sources = import.meta.glob(
  [
    '../../blog-crux/{astro.config.ts,package.json,pnpm-lock.yaml,pnpm-workspace.yaml,tailwind.config.ts,tsconfig.json,.nvmrc,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../blog-crux/{src,content,public}/**/*',
    '!../../blog-crux/**/node_modules/**',
    '!../../blog-crux/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(
  ['../../blog-crux/{src,content,public}/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'blog',
  greeting:
    'Your blog is planted on the Astro Cactus theme: a welcome post, a first note and a tag, with search, RSS, a dark mode and social cards built in. Add a post from the Builder or ask me to draft one; Share selected content publishes it as a site.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'Posts',
        singular: 'Post',
        glob: 'content/posts/**/*.md',
        routeBase: '/posts/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Post title' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One line shown on the list and in search',
          },
          {
            key: 'publishDate',
            label: 'Date',
            type: 'text',
            placeholder: '2026-09-14T12:00:00Z',
          },
        ],
        new: {
          pathTemplate: 'content/posts/{slug}.md',
          // Noon UTC: a bare date is midnight UTC, which shows as the day before west of Greenwich.
          frontmatter: { title: '{title}', description: '', publishDate: '{today}T12:00:00Z' },
          body: '\nWrite your post here.\n',
        },
        sort: { field: 'publishDate', dir: 'desc' },
      },
      {
        name: 'Notes',
        singular: 'Note',
        glob: 'content/notes/**/*.md',
        routeBase: '/notes/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Note title' },
          { key: 'description', label: 'Description', type: 'text', placeholder: 'Optional' },
          {
            key: 'publishDate',
            label: 'Time',
            type: 'text',
            placeholder: '2026-09-14T12:00:00Z',
          },
        ],
        new: {
          pathTemplate: 'content/notes/{slug}.md',
          frontmatter: { title: '{title}', description: '', publishDate: '{today}T12:00:00Z' },
          body: '\nA short thought.\n',
        },
        sort: { field: 'publishDate', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'title', label: 'Blog title', type: 'text', placeholder: 'My Blog' },
        {
          key: 'description',
          label: 'Tagline',
          type: 'text',
          placeholder: 'Thoughts, ideas, and stories',
        },
        { key: 'author', label: 'Author', type: 'text', placeholder: 'Your name' },
        {
          key: 'url',
          label: 'Public address',
          type: 'text',
          placeholder: 'https://… once shared (for canonical links and the sitemap)',
        },
      ],
    },
  },
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../blog-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../blog-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
