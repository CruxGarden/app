import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  '../../rawgraphs-crux/{*.json,*.md,LICENSE,yarn.lock,.prettierrc,{src,public,scripts}/**/*.{js,cjs,ts,json,html,css,scss,md,txt,svg,csv,tsv}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../rawgraphs-crux/{runtime/**/*,{src,public}/**/*.{png,jpg,jpeg,gif,ico,woff,woff2,ttf,otf,eot}}',
    '!../../rawgraphs-crux/**/*.css',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob('../../rawgraphs-crux/runtime/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../rawgraphs-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../rawgraphs-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
