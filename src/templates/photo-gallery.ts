import type { TemplateDefinition } from './index';
import { LAYOUT_VISUAL } from './index';
// The Photo Gallery template (ADR 0006's bundled starter set): astro-photo-folio
// (MIT) as an Astro Site Crux. Text travels as text so the Crux is a plain Astro
// project in any editor; the photographs, icons and share image as bytes.
const sources = import.meta.glob(
  [
    '../../photo-gallery-crux/{astro.config.mjs,package.json,pnpm-lock.yaml,tsconfig.json,LICENSE,README.md,UPSTREAM.md,.cruxignore,.nvmrc}',
    '../../photo-gallery-crux/{src,public,scripts}/**/*',
    '!../../photo-gallery-crux/**/node_modules/**',
    '!../../photo-gallery-crux/**/*.{jpg,jpeg,png,webp,avif,ico}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(
  [
    '../../photo-gallery-crux/{src,public}/**/*.{jpg,jpeg,png,webp,avif,ico}',
    '!../../photo-gallery-crux/**/node_modules/**',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'photo-gallery',
  greeting:
    'Your gallery is hung: a digital gallery on the home page, a film gallery, a photo-a-month calendar and a journal, with a lightbox over all of them. The photographs are the generated placeholders that came with the theme — drop your own .jpg, .png or .webp into src/assets/digital/, src/assets/analog/ or src/assets/calendar/ (named 2026-04.jpg) and they appear, captioned from the filename. Name the gallery in the settings; Share publishes it as a site.',
  layout: LAYOUT_VISUAL,
  contentModel: {
    collections: [
      {
        name: 'Journal',
        singular: 'Entry',
        glob: 'src/content/journal/**/*.{md,mdx}',
        routeBase: '/journal/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Entry title' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One line shown on the card',
          },
          { key: 'pubDate', label: 'Published', type: 'text', placeholder: '2026-09-20' },
        ],
        new: {
          pathTemplate: 'src/content/journal/{slug}.md',
          frontmatter: {
            title: '{title}',
            description: '',
            pubDate: '{today}',
          },
          body: '\nWhere you were, what the light was doing.\n',
        },
        sort: { field: 'pubDate', dir: 'desc' },
      },
    ],
    settings: {
      path: 'src/config.json',
      fields: [
        { key: 'name', label: 'Your name', type: 'text', placeholder: 'The name on the gallery' },
        { key: 'title', label: 'Gallery title', type: 'text', placeholder: 'My Photographs' },
        {
          key: 'description',
          label: 'Description',
          type: 'text',
          placeholder: 'One line, used for search and sharing',
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
      path: path.replace('../../photo-gallery-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../photo-gallery-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
