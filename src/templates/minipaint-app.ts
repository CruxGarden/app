import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  '../../minipaint-crux/{src/**/*,garden/**/*,package.json,package-lock.json,webpack.config.js,index.html,.babelrc,MIT-LICENSE.txt,README.md,UPSTREAM.md}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  ['../../minipaint-crux/{images,runtime}/**/*', '!../../minipaint-crux/**/*.css'],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
// Preserve stylesheet-relative URLs; Vite processes CSS imported with ?url.
const styles = import.meta.glob('../../minipaint-crux/{images,runtime}/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../minipaint-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../minipaint-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
