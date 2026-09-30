import { LAYOUT_WRITING, type TemplateDefinition } from './index';

const sources = import.meta.glob(
  [
    '../../documentation-crux/{astro.config.mjs,package.json,package-lock.json,tsconfig.json,.nvmrc,.cruxignore,LICENSE,README.md,UPSTREAM.md}',
    '../../documentation-crux/src/**/*',
    '../../documentation-crux/public/**/*',
    '!../../documentation-crux/public/**/*.woff2',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob('../../documentation-crux/public/**/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  greeting: '',
  meta: { messages: [] },
  context:
    'An Astro Starlight documentation site. Edit Markdown pages in src/content/docs, journal stories in src/content/journal, and site settings in src/config.json. Keep generated dist and node_modules out of Artifacts. See UPSTREAM.md for provenance.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'Pages',
        singular: 'Page',
        glob: 'src/content/docs/**/*.md',
        routeBase: '/',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' },
        ],
        new: {
          pathTemplate: 'src/content/docs/guides/{slug}.md',
          frontmatter: { title: '{title}', description: '' },
          body: '\nWrite your page here.\n',
        },
      },
      {
        name: 'Journal',
        singular: 'Story',
        glob: 'src/content/journal/**/*.md',
        routeBase: '/blog/',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' },
          { key: 'category', label: 'Category', type: 'text' },
          { key: 'order', label: 'Order', type: 'number' },
        ],
        new: {
          pathTemplate: 'src/content/journal/{slug}.md',
          frontmatter: { title: '{title}', description: '', category: 'Journal', order: '0' },
          body: '\nWrite your story here.\n',
        },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'title', label: 'Site title', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'footer', label: 'Footer', type: 'text' },
      ],
    },
  },
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../documentation-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../documentation-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
