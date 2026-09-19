import type { ToolTemplateFiles } from './index';
const source = import.meta.glob(
  [
    '../../gephi-crux/{*.json,*.ts,*.js,*.mjs,*.md,.prettierrc.json,.cruxignore}',
    '../../gephi-crux/{garden,scripts}/**/*',
    '../../gephi-crux/packages/*/*.{json,mts,html,md,ts}',
    '../../gephi-crux/packages/*/{src,types,public}/**/*.{ts,tsx,js,json,html,scss,css,md,mdx,svg,gexf,graphml,txt,webmanifest}',
    '../../gephi-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../gephi-crux/runtime/**/*',
    '!../../gephi-crux/runtime/**/*.css',
    '../../gephi-crux/packages/*/{src,public}/**/*.{png,ico,ttf,eot,woff,woff2}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../gephi-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../gephi-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
