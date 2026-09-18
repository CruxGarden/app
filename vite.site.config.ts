import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * The crux.garden public website, built on its own.
 *
 * The main config builds the whole product: every Template Crux's source is
 * globbed in as text, so the bundle is gigabytes and the build expects each
 * template's own toolchain to be installed. The website needs none of that —
 * it is one component and a WebGL panel — so it gets its own root and pulls
 * in only what it imports.
 *
 * publicDir still points at the app's public/, which is where the fonts and
 * icons the page references live.
 */
export default defineConfig({
  plugins: [react()],
  root: 'site',
  // 8081, deliberately not the app's 8080: desktop.sh --dev probes 8080 and
  // points Electron at whatever answers, so a website server there would be
  // loaded inside the desktop shell instead of the app.
  server: { port: 8081 },
  preview: { port: 8081 },
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
