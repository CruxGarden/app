import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const sources = import.meta.glob(
  '../../audiomass-crux/{LICENSE,THIRD_PARTY_NOTICES.md,README.md,UPSTREAM.md,src/**/*.{js,html,css,json,py,go,txt,md}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  '../../audiomass-crux/src/**/*.{wasm,png,jpg,svg,woff,woff2,ttf,eot,mp3,mp4}',
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../audiomass-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../audiomass-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'audiomass', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'src/index.html' } },
  greeting:
    'AudioMass is ready for recordings, waveform effects and multitrack arrangements. Your active audio project saves with this Crux. Use the native audio and session exports to take your work elsewhere.',
  context:
    'Actual AudioMass source and editor. Entry src/index.html needs no build. data/project.json preserves the active waveform, native multitrack arrangement and markers; decoded PCM channels are immutable data/assets Artifacts. Use inspect_audiomass and rename_audiomass_track while open. Preserve the native model. Native named browser drafts are separate; open a draft to save it into this Crux. Whole-editor publishing is unavailable. See UPSTREAM.md.',
};
export default template;
