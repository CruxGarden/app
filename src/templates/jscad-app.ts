import type { ToolTemplateFiles } from './index';
// JSCAD travels with the Crux: the page, the starter model, the bridge, the validator,
// notes, licences, upstream's styles and examples as text; its released bundle, fonts
// and images as published assets (styles stay text so Vite leaves their font paths alone).
const sources = import.meta.glob(
  [
    '../../jscad-crux/{index.html,style.css,model.js,package.json,README.md,UPSTREAM.md}',
    '../../jscad-crux/{garden,licenses,css}/**/*',
    '../../jscad-crux/examples/**/*.{js,json,md}',
    '!../../jscad-crux/**/node_modules/**',
    '!../../jscad-crux/**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../jscad-crux/{dist,fonts,imgs}/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../jscad-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../jscad-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
