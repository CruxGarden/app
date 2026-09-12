import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const source = import.meta.glob(
  [
    '../../opencut-crux/{package.json,package-lock.json,tsconfig.json,vite.config.mjs,index.html,LICENSE,UPSTREAM.md,.cruxignore,.npmrc,Cargo.toml,Cargo.lock}',
    '../../opencut-crux/{apps/web/src,apps/desktop,garden,rust}/**/*.{js,jsx,ts,tsx,mjs,cjs,json,css,html,svg,txt,md,rs,toml,lock,wgsl}',
    '!../../opencut-crux/garden/local-provider.test.mjs',
    '../../opencut-crux/apps/web/public/**/*.{json,xml,svg,txt}',
    '../../opencut-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../opencut-crux/runtime/**/*',
    '!../../opencut-crux/runtime/**/*.css',
    '!../../opencut-crux/runtime/**/*.map',
    '../../opencut-crux/apps/web/{public,src}/**/*.{wasm,png,jpg,jpeg,avif,webp,gif,ico,woff,woff2,ttf,eot,mp4}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../opencut-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../opencut-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'opencut', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Make a video with OpenCut. Import your clips, arrange and trim the timeline, add text, then export a video. Garden preserves your project library and original media together.',
  context:
    'Actual OpenCut Classic editor, pinned source cf5e79e. Native media, timeline, text, preview and video export remain. Native project records, library, preferences and original bytes live in fingerprinted Artifacts referenced by data/project.json. Native Undo is session state; Growth preserves saved versions. App Tools inspect the timeline, name a project and change an existing text element. Local originals up to 128 MB each; system fonts and browser codec availability apply. Online sound/sticker catalogues, model-downloading transcription, hosted accounts and whole-editor publishing are excluded. Upstream Classic is archived; this is an independent adaptation. Source, pinned lockfile and notices travel with the Crux. npm ci --ignore-scripts && npm run build rebuilds the browser runtime using the pinned published native WASM package. See UPSTREAM.md.',
};
export default template;
