import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The actual BeepBox editor travels with the Crux (MIT): editor, synth and player
// source, build scripts, the built website, the Garden bridge and notices.
const assets = import.meta.glob(
  [
    '../../beepbox-crux/{package.json,package-lock.json,LICENSE.md,README.md,UPSTREAM.md,.cruxignore}',
    '../../beepbox-crux/{editor,synth,player,scripts,garden,website}/**/*',
    '!../../beepbox-crux/**/node_modules/**',
    '!../../beepbox-crux/**/*.map',
    '!../../beepbox-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../beepbox-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'beepbox', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'website/index.html' } },
  greeting:
    'Sketch a tune with BeepBox. Click the pattern grid to place notes, pick instruments per channel, set the tempo and press play. Garden saves the song with every change.',
  context:
    'Actual BeepBox, pinned upstream 355e510. The song is the string BeepBox puts in its URL, saved as data/project.json after each change; reopening restores it. App Tools inspect the song (key, tempo, beats per bar, bars, channels), set the tempo and set the key; they change the song the way a pasted link does and never start playback. MP3 export uses a local lamejs copy; BeepBox preferences and its song recovery list stay in the browser profile. Source, lockfile and notices travel with the Crux; npm ci --ignore-scripts && npm run build:garden rebuilds website/. See UPSTREAM.md.',
};
export default template;
