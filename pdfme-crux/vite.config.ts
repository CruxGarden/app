import { defineConfig } from 'vite';
// Crux Garden: the layout tool's runtime (OUT_DIR=runtime) is served from the Crux's own folder.
export default defineConfig({
  base: './',
  clearScreen: false,
  build: { outDir: process.env.OUT_DIR || 'dist', emptyOutDir: true, chunkSizeWarningLimit: 12000 },
  server: { port: 1423, strictPort: true },
});
