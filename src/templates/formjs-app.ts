import type { ToolTemplateFiles } from './index';
// The form builder travels with the Crux: form-js (bpmn.io) as published with its
// license, the builder page, the Garden bridge, the edition script and notes. Text
// stays text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../formjs-crux/{index.html,style.css,builder.js,package.json,UPSTREAM.md,.cruxignore}',
    '../../formjs-crux/{garden,vendor,scripts}/**/*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../formjs-crux/', ''),
      content,
    })),
  ],
};
export default template;
