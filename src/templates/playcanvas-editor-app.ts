import type { ToolTemplateFiles } from './index';
const source = import.meta.glob(
  [
    '../../playcanvas-editor-crux/{package.json,package-lock.json,tsconfig.json,types.d.ts,vite.config.mjs,LICENSE,UPSTREAM.md,.cruxignore}',
    '../../playcanvas-editor-crux/{src,sass,static,garden}/**/*.{js,ts,mjs,cjs,json,scss,css,html,svg,glsl,vert,frag,txt,md}',
    '!../../playcanvas-editor-crux/garden/local-provider.test.mjs',
    '../../playcanvas-editor-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../playcanvas-editor-crux/runtime/**/*',
    '!../../playcanvas-editor-crux/runtime/**/*.css',
    '!../../playcanvas-editor-crux/runtime/**/*.map',
    '../../playcanvas-editor-crux/{src,static}/**/*.{wasm,png,jpg,jpeg,webp,gif,ico,woff,woff2,ttf,eot}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../playcanvas-editor-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../playcanvas-editor-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
