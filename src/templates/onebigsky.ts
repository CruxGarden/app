import type { TemplateDefinition, TemplateFile } from './index';
import { LAYOUT_WORKSHOP } from './index';
import regularFont from '../../onebigsky-crux/assets/fonts/Silkscreen-Regular.ttf?inline';
import boldFont from '../../onebigsky-crux/assets/fonts/Silkscreen-Bold.ttf?inline';

const sources = import.meta.glob(
  ['../../onebigsky-crux/{*.js,index.html,style.css,README.md,CRUX.md,UPSTREAM.md,ui/*.js,assets/fonts/OFL.txt}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function font(name: string, dataUrl: string): TemplateFile {
  if (!dataUrl.startsWith('data:') || !dataUrl.includes(';base64,'))
    throw new Error('The bundled One Big Sky font is unavailable.');
  return {
    path: `assets/fonts/${name}.ttf`,
    content: dataUrl.slice(dataUrl.indexOf(',') + 1),
    encoding: 'base64',
    mimeType: 'font/ttf',
  };
}

const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../onebigsky-crux/', ''),
      content,
    })),
    font('Silkscreen-Regular', regularFont),
    font('Silkscreen-Bold', boldFont),
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'One Big Sky is ready to play. Open Clean view, press Start, then W to join. Add a bot with +, press W to ready, and Enter to choose a mode and fly. A/D move, W flaps, and Escape pauses. Matches start fresh when the game reloads; Growth preserves changes to the game itself. The One Big Sky Mood is available in the Mood library. Ask me to change the game, or start a Task to experiment with its rules and artwork.',
  context:
    'One Big Sky is a local 2–4 player flying-mount arcade game by Downcast Systems. Its index.html runs directly from the Project Folder with no dependency install or build. engine.js owns physics, game.js composes the runtime, ui/ owns presentation and input, and audio.js synthesizes sounds. All scripts, styles and fonts are Artifacts. Preserve upstream attribution and font licensing. Matches and match series live in memory and reset on reload; do not claim saved player progress. Use Tasks and Growth to change the game sources. Local play does not require website publication. The optional One Big Sky Garden Mood styles Garden, not the game canvas. Keep keyboard/gamepad controls and pause-on-focus-loss behavior intact.',
};
export default template;
