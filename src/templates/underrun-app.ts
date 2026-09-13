import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The actual Underrun (MIT) runs from its sources: index.html is upstream's
// debug entry, so edits are live on reload; the 13 KB build tooling travels too.
const sources = import.meta.glob(
  [
    '../../underrun-crux/{index.html,index-debug.html,build.sh,shrinkit.js,package.json,LICENSE.md,README.md,UPSTREAM.md,.cruxignore}',
    '../../underrun-crux/source/**/*.js',
    '../../underrun-crux/build/dummy.txt',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const media = import.meta.glob(['../../underrun-crux/m/*.png'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../underrun-crux/', ''),
      content,
    })),
    ...Object.entries(media).map(([path, content]) => ({
      path: path.replace('../../underrun-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'Underrun is ready. Click the canvas to start (that also unlocks the audio), move with WASD, aim and shoot with the mouse. The whole game is a few source files under source/: change them and reload to remix it.',
  context:
    'Actual Underrun by Dominic Szablewski (js13kGames 2018), pinned upstream f933e29, running from source through upstream’s debug entry with no build; build.sh and shrinkit.js produce the 13 KB version. The game keeps no saved state, so there is no Garden document and no App Tools; the Crux is the playable game plus its editable sources, with Growth keeping the history. See UPSTREAM.md.',
};
export default template;
