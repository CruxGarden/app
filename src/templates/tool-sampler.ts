import type { TemplateDefinition, TemplateFile } from './index';
import { LAYOUT_WORKSHOP } from './index';
const sources = import.meta.glob(
  [
    '../../tool-cruxes/shared/*.{js,md,css}',
    '../../tool-cruxes/{openmosh,tables,smplr,playcanvas,excalidraw,univer}/vendor/**/*.css',
    '../../tool-cruxes/{openmosh,tables,smplr,playcanvas,excalidraw,univer}/{*.html,*.js,*.md,*.css,data/*.json,skills/**/*,samples/{LICENSE,provenance.json}}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../tool-cruxes/{openmosh,tables,smplr,playcanvas,excalidraw,univer}/{vendor/**/*,samples/*.wav,assets/*.png}',
    '!../../tool-cruxes/**/vendor/**/*.css',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
export function samplerTemplate(type: string): TemplateDefinition {
  const files: TemplateFile[] = [];
  for (const [path, content] of Object.entries(sources)) {
    const relative = path.replace('../../tool-cruxes/', '');
    if (relative.startsWith('shared/')) files.push({ path: relative, content });
    else if (relative.startsWith(type + '/'))
      files.push({ path: relative.slice(type.length + 1), content });
  }
  for (const [path, content] of Object.entries(assets)) {
    const relative = path.replace('../../tool-cruxes/', '');
    if (relative.startsWith(type + '/'))
      files.push({ path: relative.slice(type.length + 1), content, encoding: 'asset-url' });
  }
  const guidance: Record<string, string> = {
    excalidraw:
      'Draw shapes, connect ideas, add text or drop an image. Export a drawing, PNG or SVG.',
    univer:
      'Edit the example budget, add formulas and sheets. Export the workbook or a CSV of the active sheet.',
    openmosh:
      'Import an image, add effects and export a PNG. The original stays separate from your effect settings.',
    tables:
      'Double-click cells to edit your project tracker. Try Contacts or Inventory, add columns, and import or export CSV.',
    smplr:
      'Press Play pattern or tap a sample pad. Change the sixteen steps and tempo; sound starts only when you ask it to.',
    playcanvas:
      'Add a shape, select an object and change its transform or color. Try the two camera views. The included PlayCanvas skills guide source customization.',
  };
  return {
    files,
    layout: LAYOUT_WORKSHOP,
    meta: { settings: { entryFile: 'index.html' } },
    greeting:
      guidance[type] +
      ' Changes save with Growth. Ask me to help with the project, or use Customize app to change the app itself in a Task.',
    context: `This is the local ${type} creation tool. App source, runtime and notices are Artifacts; data/project.json holds the editable project. Read shared/model.js for its schema. Keep imported images in data/assets/ and sample files intact. Use the app-specific inspect tool first, then its scoped command to change content and confirm saves. Commands require this app open in Workshop; raw file edits require Reload saved project. Use Tasks for app-source customization. No public website sharing is implemented for this sampler. ${type === 'playcanvas' ? 'Read skills/apply-conventions/SKILL.md and skills/assemble-scene/SKILL.md before engine changes.' : ''}`,
  };
}
