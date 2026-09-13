import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The actual Hextris game (GPL-3.0) runs from its sources with no build step.
const assets = import.meta.glob(
  [
    '../../hextris-crux/{index.html,LICENSE.md,README.md,UPSTREAM.md,.cruxignore,favicon.ico,manifest.webmanifest}',
    '../../hextris-crux/{js,vendor,images,garden}/**/*',
    '../../hextris-crux/style/**/*',
    '!../../hextris-crux/**/*.css',
    '!../../hextris-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob(['../../hextris-crux/style/**/*.css'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../hextris-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../hextris-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'hextris', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'Hextris is ready. Press the hexagon to start, rotate with the arrow keys and match colours before the blocks pile up. Garden keeps your saved game and high scores; change the sources under js/ and style/ to make it your own.',
  context:
    'Actual Hextris, pinned upstream 3f4847d, running from its source files with no build. The game’s saved state and high scores (the two localStorage strings it writes) are saved as data/project.json and restored on reopen. App Tools inspect the game (state, score, high scores, saved game) and reset progress; they never play the game. The ad, analytics and Google Fonts tags were removed; everything else is upstream. The sources are Artifacts: editing them changes the game on the next reload, with Growth keeping the history. See UPSTREAM.md.',
};
export default template;
