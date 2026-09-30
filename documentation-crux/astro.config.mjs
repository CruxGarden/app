import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import settings from './src/config.json' with { type: 'json' };

export default defineConfig({
  base: process.env.CRUX_DOCS_BASE || '/',
  trailingSlash: 'ignore',
  integrations: [starlight({
    title: settings.title,
    description: settings.description,
    favicon: '/mark.svg',
    customCss: ['./src/styles/garden.css'],
    components: { SiteTitle: './src/components/SiteTitle.astro', Footer: './src/components/Footer.astro' },
    sidebar: [
      { label: 'Welcome', link: '/' },
      { label: 'Start small', items: [{ autogenerate: { directory: 'start' } }] },
      { label: 'Grow your practice', items: [{ autogenerate: { directory: 'guides' } }] },
      { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
    ],
  })],
});
