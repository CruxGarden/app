import type { ToolTemplateFiles } from './index';

/**
 * Link: hook an existing project into Crux Garden.
 *
 * The code is never made a resident of the garden: it stays in its own
 * repository and the Crux is the handle that lets the tooling act on it. What
 * travels is that knowledge, never the folder — which is why a folder becomes
 * runnable only by being chosen in the OS dialog.
 *
 * Everything else about this tool is `crux-tool.json` (ADR 0050).
 */
const sources = import.meta.glob(
  [
    '../../link-crux/{index.html,style.css,app.js,README.md,UPSTREAM.md}',
    '../../link-crux/garden/*.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: ToolTemplateFiles = {
  files: Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../link-crux/', ''),
    content,
  })),
};
export default template;
