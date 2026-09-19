import type { ToolTemplateFiles } from './index';
const source = import.meta.glob(
  [
    '../../blockbench-crux/{*.json,*.js,*.html,*.md,*.MD,.cruxignore}',
    '../../blockbench-crux/{garden,scripts,js,css,lib,assets,content,keymaps,lang,themes}/**/*.{js,cjs,mjs,ts,json,html,css,svg,glsl,vue,bbtheme,bbkeymap,md,MD,txt}',
    '../../blockbench-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../blockbench-crux/runtime/**/*',
    '!../../blockbench-crux/runtime/**/*.css',
    '../../blockbench-crux/{*.png,*.ico}',
    '../../blockbench-crux/{assets,font,icons,lib}/**/*.{png,jpg,jpeg,webp,gif,ico,woff,woff2,ttf,eot,svg}',
    '!../../blockbench-crux/assets/**/*.svg',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../blockbench-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../blockbench-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
