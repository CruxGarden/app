import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The Digital Garden template (ADR 0006's bundled starter set): Veka (MIT) as an
// Astro Site Crux with Crux Garden's backlinks and graph on top. Text travels as
// text so the Crux is a plain Astro project in any editor; the favicon as bytes.
const sources = import.meta.glob(
  [
    '../../digital-garden-crux/{astro.config.mjs,package.json,pnpm-lock.yaml,tsconfig.json,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../digital-garden-crux/{src,public}/**/*',
    '!../../digital-garden-crux/**/node_modules/**',
    '!../../digital-garden-crux/**/*.test.*',
    '!../../digital-garden-crux/public/favicon.ico',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(['../../digital-garden-crux/public/favicon.ico'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'digital-garden',
  greeting:
    'Your digital garden is planted: five notes about gardening itself, linked with [[wikilinks]], each carrying a growth stage. The preview runs Astro with a folder tree, search, tags, Linked from under every note and a graph of the whole garden. Add a note from the Builder or ask me to write one; Share selected content publishes the garden as a site.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'Notes',
        singular: 'Note',
        glob: 'src/content/wiki/**/*.md',
        routeBase: '/wiki/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Note title' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One line shown on cards and in search',
          },
          {
            key: 'growthStage',
            label: 'Growth stage',
            type: 'select',
            options: [
              { label: 'Seedling', value: 'seedling' },
              { label: 'Budding', value: 'budding' },
              { label: 'Evergreen', value: 'evergreen' },
            ],
          },
          { key: 'updatedAt', label: 'Updated', type: 'text', placeholder: '2026-09-14' },
        ],
        new: {
          pathTemplate: 'src/content/wiki/notes/{slug}.md',
          frontmatter: {
            title: '{title}',
            description: '',
            createdAt: '{today}',
            updatedAt: '{today}',
            growthStage: 'seedling',
          },
          body: '\nA seedling. Link to other notes with [[double brackets]].\n',
        },
        sort: { field: 'updatedAt', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'title', label: 'Garden name', type: 'text', placeholder: 'My Digital Garden' },
        {
          key: 'description',
          label: 'Tagline',
          type: 'text',
          placeholder: 'A living collection of notes',
        },
        { key: 'author', label: 'Gardener', type: 'text', placeholder: 'Your name' },
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
      path: path.replace('../../digital-garden-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../digital-garden-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
