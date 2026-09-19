import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  '../../bitsy-crux/{*.md,*.txt,dev/**/*.{cjs,bitsy,bitsyfont,tsv,html,css,svg},editor/**/*.{js,html,css,txt,bitsyfont}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob('../../bitsy-crux/editor/**/*.{png,jpg,gif,svg,woff,woff2,ttf}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../bitsy-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../bitsy-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
