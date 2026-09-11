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
    sourcemap: true,
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
        /(jupyterlite|rawgraphs|piskel|mermaid|openmosh|minipaint)-crux\//,
      ],
    },
  },
});
