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
  esbuild: {
    // These Template Cruxes travel as text - the template globs pull them in
    // with `?raw` - but Vite still ran esbuild over every .ts it saw, and
    // esbuild reads the nearest tsconfig. Each of these tsconfigs extends a
    // toolchain the template does not vendor (astro/tsconfigs/*, or
    // mermaid's generated .svelte-kit), so building crux.garden quietly
    // depended on having installed each template's own dependencies.
    // None of them are imported as TypeScript, so nothing needs to compile.
    // Add a directory here if a new template's tsconfig `extends` something.
    exclude: [/(?:blog|digital-garden|homepage|recipes|storefront|mermaid)-crux\/.*\.tsx?$/],
  },
  build: {
    outDir: 'dist',
    // Sourcemaps are for debugging a local build. The crux.garden build skips
    // them: generating them for a bundle this size is what exhausts Node's heap
    // on a CI runner, and publishing them would serve our source to visitors.
    sourcemap: !process.env.VITE_PUBLIC_SITE,
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
