import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  base: './',
  publicDir: 'apps/web/public',
  plugins: [react({ babel: { plugins: ['@lingui/babel-plugin-lingui-macro'] } })],
  resolve: {
    alias: [
      { find: '~/utils/garden-attachments', replacement: path('./garden/model.ts') },
      { find: '~/utils/api', replacement: path('./garden/api.tsx') },
      { find: '~/env', replacement: path('./garden/env.ts') },
      { find: '~', replacement: path('./apps/web/src') },
      { find: '@kan/auth/client', replacement: path('./garden/auth.ts') },
      { find: '@kan/shared/utils', replacement: path('./garden/shared-utils.ts') },
      {
        find: '@kan/shared/constants',
        replacement: path('./packages/shared/src/constants/index.ts'),
      },
      { find: '@kan/shared', replacement: path('./garden/shared.ts') },
      { find: /^next\/(navigation|router|link)$/, replacement: path('./garden/navigation.tsx') },
      { find: 'next/head', replacement: path('./garden/platform.tsx') },
      { find: 'next/image', replacement: path('./garden/image.ts') },
      { find: 'next/dynamic', replacement: path('./garden/dynamic.ts') },
      { find: 'next-runtime-env', replacement: path('./garden/runtime-env.ts') },
    ],
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'process.env': '{}' },
  build: { outDir: 'runtime', sourcemap: true },
});
