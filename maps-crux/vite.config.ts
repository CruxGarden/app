import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync, existsSync, renameSync } from 'node:fs';
// Crux Garden: `build:garden` bundles the editor (index.html) and the viewer (edition.html) into
// runtime/; `--mode edition` builds the public map alone into dist/ with the saved places baked in.
export default defineConfig(({ mode }) => ({
  base: './',
  clearScreen: false,
  plugins: [
    {
      name: 'maps-public-edition',
      transformIndexHtml(html) {
        if (mode !== 'edition') return html;
        const doc = JSON.parse(readFileSync(resolve(process.cwd(), 'data/project.json'), 'utf8'));
        if (!doc || doc.app !== 'maps') throw new Error('This Crux holds no map.');
        const data = JSON.stringify(doc.project ?? null).replace(/</g, '\\u003c');
        return html.replace('<head>', `<head>\n    <script>window.__MAP__ = ${data};</script>`);
      },
      closeBundle() {
        // The public map is the site's front page.
        if (mode !== 'edition') return;
        const out = resolve(process.cwd(), 'dist');
        if (existsSync(resolve(out, 'edition.html'))) renameSync(resolve(out, 'edition.html'), resolve(out, 'index.html'));
      },
    },
  ],
  build: {
    outDir: mode === 'edition' ? 'dist' : process.env.OUT_DIR || 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: mode === 'edition' ? { edition: resolve(__dirname, 'edition.html') } : { index: resolve(__dirname, 'index.html'), edition: resolve(__dirname, 'edition.html') },
    },
  },
  server: { port: 1424, strictPort: true },
}));
