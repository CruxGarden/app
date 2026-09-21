import type { ToolTemplateFiles } from './index';

/**
 * Runner: the board for a Cruxspace used as a development workspace.
 *
 * It owns the configuration and conducts; the Stack and Project Cruxes beside
 * it own what is running (ADR 0053). Unlike them it is shared, because a
 * workspace is handed over as a Cruxspace template holding all three.
 *
 * Everything else about this tool is `crux-tool.json` (ADR 0050).
 */
const sources = import.meta.glob(
  [
    '../../runner-crux/{index.html,style.css,app.js,README.md,UPSTREAM.md}',
    '../../runner-crux/garden/*.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: ToolTemplateFiles = {
  files: Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../runner-crux/', ''),
    content,
  })),
};
export default template;
