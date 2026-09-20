import type { ToolTemplateFiles } from './index';

/**
 * Project: run a checkout that lives outside the Crux.
 *
 * The code stays in its own repository — these projects go to GitLab, not to
 * other people's gardens — and the Crux records how it runs here. That is why
 * the tool is never shared: the record names a folder on this machine, and a
 * folder becomes runnable only by being chosen in the OS dialog.
 *
 * Everything else about this tool is `crux-tool.json` (ADR 0050).
 */
const sources = import.meta.glob(
  [
    '../../project-crux/{index.html,style.css,app.js,README.md,UPSTREAM.md}',
    '../../project-crux/garden/*.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: ToolTemplateFiles = {
  files: Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../project-crux/', ''),
    content,
  })),
};
export default template;
