/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8080,
  },
  optimizeDeps: {
    exclude: ['wa-sqlite'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    // Source maps for the embedded apps came to 297 MB, and Electron copies the
    // whole of `dist` into the packaged app (electron/package.json
    // `extraResources`), so every user downloaded them. Opt in with
    // CRUX_SOURCEMAPS=1 when debugging a production build.
    sourcemap: process.env.CRUX_SOURCEMAPS === '1',
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Template stylesheets must remain text, rather than Vitest's default CSS stub.
    css: {
      include: [
        /5ws-site\/src\/styles\//,
        /(kan|web-synth|hextris|pptist|wick-editor|bentopdf|eventcalendar|formjs|pdfme|maps|p5|glsl|glyphr|fmg|abc|signal|jscad|timeline|digital-garden|blog|homepage|recipes|storefront|recorder|opencut|playcanvas-editor|gdevelop|blockbench|svgedit|twine|ketcher|gephi|jupyterlite|rawgraphs|piskel|mermaid|openmosh|minipaint)-crux\//,
      ],
    },
  },
});
