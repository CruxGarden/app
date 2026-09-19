import type { ToolTemplateFiles } from './index';
const source = import.meta.glob(
  [
    '../../opencut-crux/{package.json,package-lock.json,tsconfig.json,vite.config.mjs,index.html,LICENSE,UPSTREAM.md,.cruxignore,.npmrc,Cargo.toml,Cargo.lock}',
    '../../opencut-crux/{apps/web/src,apps/desktop,garden,rust}/**/*.{js,jsx,ts,tsx,mjs,cjs,json,css,html,svg,txt,md,rs,toml,lock,wgsl}',
    '!../../opencut-crux/garden/local-provider.test.mjs',
    '../../opencut-crux/apps/web/public/**/*.{json,xml,svg,txt}',
    '../../opencut-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../opencut-crux/runtime/**/*',
    '!../../opencut-crux/runtime/**/*.css',
    '!../../opencut-crux/runtime/**/*.map',
    '../../opencut-crux/apps/web/{public,src}/**/*.{wasm,png,jpg,jpeg,avif,webp,gif,ico,woff,woff2,ttf,eot,mp4}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../opencut-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../opencut-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
