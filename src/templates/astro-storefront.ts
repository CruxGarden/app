import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The Storefront starter: the Astro Keel fork (MIT) with a products collection and
// hosted checkout — a buy link per product, or a Snipcart cart when the shop has a
// key. Text travels as text so the Crux is a plain Astro project in any editor.
const sources = import.meta.glob(
  [
    '../../storefront-crux/{astro.config.mjs,package.json,pnpm-lock.yaml,remark-reading-time.mjs,tsconfig.json,.nvmrc,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../storefront-crux/{src,public}/**/*',
    '!../../storefront-crux/**/node_modules/**',
    '!../../storefront-crux/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(
  ['../../storefront-crux/{src,public}/**/*.{png,jpg,jpeg,gif,ico,ttf,woff,woff2}'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'storefront',
  greeting:
    'I’ve set up your shop: three products to start, a shop page by category, a page per product with its price and a buy button, a blog for the stories, search and a feed. Paste a checkout link (Stripe, Lemon Squeezy, Gumroad) on a product, or a Snipcart key in the settings for a cart; add products from the Builder or ask me.',
  layout: LAYOUT_WRITING,
  contentModel: {
    collections: [
      {
        name: 'Products',
        singular: 'Product',
        glob: 'src/content/products/**/*.md',
        routeBase: '/shop/',
        fields: [
          { key: 'name', label: 'Name', type: 'text', placeholder: 'Garden print, A3' },
          {
            key: 'description',
            label: 'Description',
            type: 'text',
            placeholder: 'One line: what it is',
          },
          { key: 'price', label: 'Price', type: 'number', placeholder: '28' },
          { key: 'currency', label: 'Currency', type: 'text', placeholder: 'USD' },
          {
            key: 'buyUrl',
            label: 'Checkout link',
            type: 'text',
            placeholder: 'https://buy.stripe.com/… (or leave empty for the cart or an enquiry)',
          },
          {
            key: 'publishDate',
            label: 'Date',
            type: 'text',
            placeholder: '2026-09-14T12:00:00Z',
          },
        ],
        new: {
          pathTemplate: 'src/content/products/{slug}.md',
          frontmatter: {
            name: '{title}',
            description: '',
            price: '0',
            currency: 'USD',
            buyUrl: '',
            publishDate: '{today}T12:00:00Z',
          },
          body: '\nThe story of this product: what it is, how it is made, how it ships.\n',
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
        { key: 'name', label: 'Shop name', type: 'text', placeholder: 'My Shop' },
        { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Small things, made well' },
        {
          key: 'about',
          label: 'About',
          type: 'textarea',
          placeholder: 'A few lines about the shop',
        },
        { key: 'currency', label: 'Currency', type: 'text', placeholder: 'USD' },
        {
          key: 'contactEmail',
          label: 'Enquiry email',
          type: 'text',
          placeholder: 'Used when a product has no checkout link',
        },
        {
          key: 'snipcartApiKey',
          label: 'Snipcart public key',
          type: 'text',
          placeholder: 'Optional: turns on the cart (snipcart.com)',
        },
        {
          key: 'url',
          label: 'Public address',
          type: 'text',
          placeholder: 'https://… once shared (for canonical links, the feed and the sitemap)',
        },
      ],
    },
  },
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../storefront-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../storefront-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
