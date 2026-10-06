import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import settings from './src/config.json' with { type: 'json' };

// https://astro.build/config
export default defineConfig({
  integrations: [icon()],
  // The public address comes from src/config.json and is empty until the site
  // is shared, so Astro is only told about it once it exists — canonical links
  // and Open Graph tags stay relative rather than claiming a domain this site
  // does not have. @astrojs/sitemap is not used for the same reason.
  ...(settings.url ? { site: settings.url } : {}),
});
