/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import cruxTools from './vite-plugin-crux-tools';
import cruxAssets from './vite-plugin-crux-assets';
import notices from './vite-plugin-notices';
import documentation from './vite-plugin-documentation';
const thirdPartyNotices = notices(__dirname);
// Runtime packaging checks follow the same manifest selection as prebuild and
// verify-tools. Host/service tests still cover the entire catalog. Never select
// tests based on whether an ignored runtime happens to exist on this machine.
const toolTestMode = process.env.CRUX_BUNDLE_TOOLS || 'bundled';
const excludedToolPackages = readdirSync(__dirname)
  .filter((name) => name.endsWith('-crux'))
  .map((name) => path.join(__dirname, name, 'crux-tool.json'))
  .filter((file) => existsSync(file))
  .map((file) => JSON.parse(readFileSync(file, 'utf8')) as { id: string; bundled?: boolean })
  .filter((tool) => toolTestMode !== 'all' && !(toolTestMode === 'bundled' && tool.bundled))
  .map((tool) => `src/templates/${tool.id}.test.ts`);

export default defineConfig({
  plugins: [
    documentation(),
    cruxAssets(),
    react(),
    tailwindcss(),
    cruxTools(__dirname),
    thirdPartyNotices.main,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // @cruxgarden/plasma-ui takes React as a peer and calls hooks. Without
    // this, its `react` import resolved to a second pre-bundled copy and every
    // hook inside PlasmaProvider threw "Cannot read properties of null
    // (reading 'useState')" — the invalid-hook-call error, wearing a disguise.
    dedupe: ['react', 'react-dom'],
  },
  // A tool's built runtime is shipped as files, never imported: every path
  // under a `*-crux/runtime/` is an asset, so the dev server serves an
  // extensionless LICENSE or a .txt with `?url` instead of parsing it as a
  // module (Twine, BentoPDF, GDevelop and most of the others carry such files).
  assetsInclude: [/-crux\/runtime\//],
  server: {
    port: 8080,
  },
  optimizeDeps: {
    // Bundled tools contain their own HTML and Node-only build code. They are
    // served as assets; only the host application's entry needs prebundling.
    entries: ['index.html'],
    exclude: ['wa-sqlite', '@cruxgarden/plasma-ui'],
  },
  worker: {
    format: 'es',
    plugins: () => [thirdPartyNotices.worker()],
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
    exclude: [
      /(?:documentation|blog|digital-garden|homepage|recipes|storefront|mermaid|business|resume|photo-gallery)-crux\/.*\.tsx?$/,
    ],
  },
  build: {
    outDir: 'dist',
    // Sourcemaps are for debugging a local build. The crux.garden build skips
    // them: generating them for a bundle this size is what exhausts Node's heap
    // on a CI runner, and publishing them would serve our source to visitors.
    sourcemap: !process.env.VITE_PUBLIC_SITE,
  },
  test: {
    // Archive/template tests load whole editor distributions. Parallel transforms
    // exhaust memory and cause false timeouts even on large development machines.
    maxWorkers: 1,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: excludedToolPackages,
    // Template stylesheets must remain text, rather than Vitest's default CSS stub.
    css: {
      include: [
        /5ws-site\/src\/styles\//,
        /(documentation|kan|web-synth|hextris|pptist|wick-editor|bentopdf|eventcalendar|formjs|pdfme|maps|p5|glsl|glyphr|fmg|abc|signal|jscad|timeline|digital-garden|blog|homepage|recipes|storefront|recorder|opencut|playcanvas-editor|gdevelop|blockbench|svgedit|twine|ketcher|gephi|jupyterlite|rawgraphs|piskel|mermaid|openmosh|minipaint)-crux\//,
      ],
    },
  },
});
