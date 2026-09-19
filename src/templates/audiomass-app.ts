import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  '../../audiomass-crux/{LICENSE,THIRD_PARTY_NOTICES.md,README.md,UPSTREAM.md,src/**/*.{js,ts,cjs,html,css,json,py,go,txt,md}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  '../../audiomass-crux/src/**/*.{wasm,png,jpg,svg,woff,woff2,ttf,eot,mp3,mp4}',
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../audiomass-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../audiomass-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
