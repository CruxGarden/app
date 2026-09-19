import type { ToolTemplateFiles } from './index';
// TimelineJS travels with the Crux: the page, the editor, the starter, the bridge, the
// validator, notes, licences and upstream's stylesheets as text; its script, locales and
// icon font as published assets (stylesheets stay text so Vite leaves their font paths alone).
const sources = import.meta.glob(
  [
    '../../timeline-crux/{index.html,style.css,app.js,timeline.json,package.json,README.md,UPSTREAM.md}',
    '../../timeline-crux/{garden,licenses}/**/*',
    '../../timeline-crux/runtime/css/**/*.css',
    '!../../timeline-crux/**/node_modules/**',
    '!../../timeline-crux/**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  ['../../timeline-crux/runtime/**/*', '!../../timeline-crux/runtime/css/**/*.css'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../timeline-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../timeline-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
