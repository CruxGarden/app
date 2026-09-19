import type { ToolTemplateFiles } from './index';
// The shader tool travels with the Crux: the page, the starter shader, the bridge, the
// validator, notes and licences as text; glslEditor's build as published assets.
const sources = import.meta.glob(
  [
    '../../glsl-crux/{index.html,shader.frag,style.css,package.json,README.md,UPSTREAM.md}',
    '../../glsl-crux/{garden,licenses}/**/*',
    '!../../glsl-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../glsl-crux/runtime/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../glsl-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../glsl-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
