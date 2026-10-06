import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import settings from './src/config.json' with { type: 'json' };

// https://astro.build/config
export default defineConfig({
  // MDX powers the journal: Markdown + components, so entries can drop in
  // gallery-style <Photo> / <Gallery> blocks.
  integrations: [mdx()],
  // Content-Security-Policy is delivered as an HTTP header from public/_headers
  // (not an Astro <meta>) so that `frame-ancestors` takes effect. The policy uses
  // script-src/style-src 'unsafe-inline' for the few small inline scripts this
  // theme ships — notably the pre-paint theme toggle in Layout.astro, which must
  // run inline before the bundle loads. Astro's security.csp is intentionally
  // left off: it would emit script hashes, and the browser ignores 'unsafe-inline'
  // whenever a hash is present.
  // The public address, taken from src/config.json. It is empty until the
  // gallery is shared, and Astro is only told about it once it exists —
  // canonical links and Open Graph tags stay relative in the meantime rather
  // than claiming a domain this gallery does not have.
  ...(settings.url ? { site: settings.url } : {}),

  // Preserve Astro's pre-v7 HTML whitespace handling. Astro 7 changed the
  // default `compressHTML` from `true` to `'jsx'`, which strips whitespace with
  // JSX rules and drops the literal spaces this theme relies on between text and
  // inline elements — e.g. "and a <a>Photo Blog</a>" would render as
  // "and aPhoto Blog", and "on <a>Instagram</a>" as "onInstagram". Pinning
  // `true` keeps the exact rendered spacing the template shipped with.
  compressHTML: true,

  // Markdown for the journal. Prism highlights code with CSS *classes* (themed in
  // global.css) rather than inline styles, so syntax colors work under the strict
  // CSP without needing 'unsafe-inline' for styles.
  markdown: {
    syntaxHighlight: 'prism',
    // Emit GFM table column alignment as `align` attributes rather than inline
    // `style="text-align:…"`, so tables stay within the strict CSP (no
    // style-src 'unsafe-inline'). Styled in global.css. Configured on the
    // `unified()` processor directly — the older `markdown.remarkRehype`
    // shortcut was deprecated ahead of Astro 7, so this is the supported form.
    processor: unified({ remarkRehype: { tableCellAlignToStyle: false } }),
  },

  // Fully static output — deploy the generated dist/ to any static host.
  // Images are optimized at build time with sharp.
  build: {
    // Inline ALL stylesheets into the HTML. With 'auto', global.css exceeded
    // the inlining threshold and shipped as an external file; whenever the
    // first paint beat that file, the page rendered unstyled and then snapped
    // into the sidebar layout — a near-whole-viewport Cumulative Layout Shift
    // attributed to html>body>main.main (seen on /calendar/). Inlining
    // guarantees the first paint already matches the final layout, and drops a
    // render-blocking request.
    inlineStylesheets: 'always',
  },
});
