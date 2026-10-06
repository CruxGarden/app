import type { ToolTemplateFiles } from './index';
// Daniel's AM-1 Arpeggio Machine (ZACOS) travels with the Crux: the instrument as
// written (index.html + am-1.js, and the untouched single file), its design notes and
// panel studies, the Garden bridge and notes.
const assets = import.meta.glob(
  [
    '../../am-1-crux/{index.html,am-1.js,am-1-machine.html,package.json,UPSTREAM.md,AM-1-HANDOFF.md,AM-1-VOICING.md,am-1-colorways.svg,am-1-panel-sketch.svg,am-1-mockup.png,.cruxignore}',
    '../../am-1-crux/garden/**/*',
    '!../../am-1-crux/**/node_modules/**',
    '!../../am-1-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../am-1-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
