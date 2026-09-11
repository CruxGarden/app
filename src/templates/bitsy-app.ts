import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const sources = import.meta.glob(
  '../../bitsy-crux/{*.md,*.txt,dev/**/*.{cjs,bitsy,bitsyfont,tsv,html,css,svg},editor/**/*.{js,html,css,txt,bitsyfont}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob('../../bitsy-crux/editor/**/*.{png,jpg,gif,svg,woff,woff2,ttf}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../bitsy-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../bitsy-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'bitsy', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'editor/index.html' } },
  greeting:
    'Make a tiny world with Bitsy. Draw rooms and sprites, write dialogue, make music, then play and export your game with the native tools. Garden keeps your editable project.',
  context:
    'Actual Bitsy 8.14.0 editor and engine. editor/index.html runs directly, no build step. data/project.json carries native game data, custom font and settings via the native Store interface. Keep Bitsy formats intact. Use inspect_bitsy and set_bitsy_title while the editor is open. Native HTML export produces a playable game. Whole-editor Garden publishing is unavailable. See UPSTREAM.md.',
};
export default template;
