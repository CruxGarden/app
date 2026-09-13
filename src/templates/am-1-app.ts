import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
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
const template: TemplateDefinition = {
  files: [
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../am-1-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'am-1', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'Play the AM-1 Arpeggio Machine: latch a chord or press a degree, set three parts cycling at different divisions, and press RUN. Garden saves the session and every patch you keep.',
  context:
    'Daniel’s AM-1 Arpeggio Machine from the ZACOS line, a single-file Web Audio instrument (three interlocking arpeggio parts, five voices, a degree keyboard, a sequencer, drone, delay, phaser, reverb, two modulators, mk1/mk2 circuits, a patch bank with a factory set). The instrument’s own session (active patch, circuit, saved bank) is the Garden document, saved after each change it records; a recorded bounce or an exported patch is kept as a binary Artifact instead of downloaded. App Tools inspect the patch, set the tempo and set the key and scale; they never press RUN. See UPSTREAM.md and AM-1-HANDOFF.md.',
};
export default template;
