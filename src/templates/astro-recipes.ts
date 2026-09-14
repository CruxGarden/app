import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The Recipe Book starter: the Astro Keel fork (MIT) with a recipes collection —
// no licensed Astro recipe theme exists, so the collection is written on a vetted
// base. Text travels as text so the Crux is a plain Astro project in any editor.
const sources = import.meta.glob(
  [
    '../../recipes-crux/{astro.config.mjs,package.json,pnpm-lock.yaml,remark-reading-time.mjs,tsconfig.json,.nvmrc,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../recipes-crux/{src,public}/**/*',
    '!../../recipes-crux/**/node_modules/**',
    '!../../recipes-crux/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(
  ['../../recipes-crux/{src,public}/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'recipes',
  greeting:
    'I’ve set up your recipe book: two recipes to start, grouped by category, each with prep and cook times, servings, a tickable ingredient list, numbered steps and a Print recipe button; a blog for the stories, search and a feed. Add a recipe from the Builder or ask me to write one.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'Recipes',
        singular: 'Recipe',
        glob: 'src/content/recipes/**/*.md',
        routeBase: '/recipes/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Roast tomato soup' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One line: what it is and why it is good',
          },
          { key: 'category', label: 'Category', type: 'text', placeholder: 'Mains' },
          { key: 'prepTime', label: 'Prep (minutes)', type: 'number', placeholder: '10' },
          { key: 'cookTime', label: 'Cook (minutes)', type: 'number', placeholder: '30' },
          { key: 'servings', label: 'Serves', type: 'number', placeholder: '4' },
          {
            key: 'publishDate',
            label: 'Date',
            type: 'text',
            placeholder: '2026-09-14T12:00:00Z',
          },
        ],
        new: {
          pathTemplate: 'src/content/recipes/{slug}.md',
          frontmatter: {
            title: '{title}',
            description: '',
            category: 'Mains',
            prepTime: '10',
            cookTime: '30',
            servings: '4',
            publishDate: '{today}T12:00:00Z',
          },
          body: '\n## Ingredients\n\n- \n\n## Method\n\n1. \n',
        },
        sort: { field: 'publishDate', dir: 'desc' },
      },
      {
        name: 'Posts',
        singular: 'Post',
        glob: 'src/content/blog/**/*.md',
        routeBase: '/blog/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Post title' },
          { key: 'description', label: 'Description', type: 'text', placeholder: 'One line' },
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
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'name', label: 'Book name', type: 'text', placeholder: 'My Recipe Book' },
        { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'The dishes we make' },
        {
          key: 'about',
          label: 'About',
          type: 'textarea',
          placeholder: 'A few lines about the kitchen',
        },
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
      path: path.replace('../../recipes-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../recipes-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
