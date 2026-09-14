// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { remarkReadingTime } from './remark-reading-time.mjs';
import config from './src/config.json' with { type: 'json' };

// https://astro.build/config
export default defineConfig({
  // Crux Garden: the public address once shared (src/config.json → url); unset until then.
  ...(config.url ? { site: config.url } : {}),
  integrations: [mdx(), ...(config.url ? [sitemap()] : [])],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkReadingTime],
    }),
    // Dual Shiki themes; `defaultColor: false` emits CSS variables
    // (--shiki-light / --shiki-dark) so global.css can switch with the theme.
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
      wrap: true,
    },
  },
});
