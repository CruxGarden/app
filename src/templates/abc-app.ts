import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The Notation tool travels with the Crux: the page, the starter tune, the bridge, the
// validator, notes and licences as text; abcjs and the piano soundfont as published assets.
const sources = import.meta.glob(
  [
    '../../abc-crux/{index.html,style.css,tune.abc,package.json,README.md,UPSTREAM.md}',
    '../../abc-crux/{garden,licenses}/**/*',
    '!../../abc-crux/**/node_modules/**',
    '!../../abc-crux/**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../abc-crux/runtime/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../abc-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../abc-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'abc', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'A score in ABC notation, rendered and played as you type: a jig to start. Edit the ABC on the left, press play under the score, and Save score to Cruxspace keeps an SVG or PNG as an output; Share selected content publishes the score as a page people can play.',
  context:
    'A notation tool around abcjs (6.7.0, MIT; vendored unmodified in runtime/, with the FluidR3 piano soundfont for offline playback). The Crux keeps the score’s name and whole ABC text in data/project.json; the page is abcjs’s editor with playback. App Tools: inspect_score, set_score_name, set_score_abc (the whole ABC: X:, T:, M:, L:, K: headers then the tune; keep line breaks), save_score_image (SVG or PNG into exports/). ABC essentials: notes C D E F G A B c d e f g a b (lowercase an octave up), numbers for lengths relative to L:, | bar lines, |: :| repeats, z rests, ^ _ = accidentals, "chords in quotes". Read data/project.json before editing. Sharing publishes the page as it is. See UPSTREAM.md.',
};
export default template;
