import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  define: { global: 'globalThis', 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    {
      name: 'garden-template-storage-copy',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/ketcher-react/dist/index.js')) return;
        const original =
          ' are saved locally and cannot be accessed on different browsers or computers.';
        const warning =
          'Be aware that other users of the same computer and browser can access them as well.';
        if (!code.includes(original) || !code.includes(warning))
          throw new Error('Review upstream template storage messaging.');
        return code
          .replace(original, ' are saved in this Crux and travel with its complete export.')
          .replace(warning, 'Each Crux keeps its own template library.');
      },
    },
  ],
  build: { commonjsOptions: { transformMixedEsModules: true }, sourcemap: true, outDir: 'runtime' },
});
