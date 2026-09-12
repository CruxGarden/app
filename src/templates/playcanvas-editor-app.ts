import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const source = import.meta.glob(
  [
    '../../playcanvas-editor-crux/{package.json,package-lock.json,tsconfig.json,types.d.ts,vite.config.mjs,LICENSE,UPSTREAM.md,.cruxignore}',
    '../../playcanvas-editor-crux/{src,sass,static,garden}/**/*.{js,ts,mjs,cjs,json,scss,css,html,svg,glsl,vert,frag,txt,md}',
    '!../../playcanvas-editor-crux/garden/local-provider.test.mjs',
    '../../playcanvas-editor-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../playcanvas-editor-crux/runtime/**/*',
    '!../../playcanvas-editor-crux/runtime/**/*.css',
    '!../../playcanvas-editor-crux/runtime/**/*.map',
    '../../playcanvas-editor-crux/{src,static}/**/*.{wasm,png,jpg,jpeg,webp,gif,ico,woff,woff2,ttf,eot}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../playcanvas-editor-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../playcanvas-editor-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'playcanvas-editor', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Build a 3D scene with PlayCanvas Editor. Edit native entities, cameras, lights and primitive shapes. Import images, create materials and write classic JavaScript scripts. Launch runs your saved scene locally. Garden preserves scene data, original assets and code together.',
  context:
    'Actual PlayCanvas Editor 2.32.0, adapted for a single local scene with render, camera, light and script components. Local assets: images, materials, classic .js scripts, text, JSON and folders. Other components, model conversion, ESM/TypeScript compilation, multiplayer, hosted asset store and publishing are not implemented. Bundled Monaco replaces the hosted code collaboration service. Saved native scene/settings/assets and original file bytes live in fingerprinted Artifacts referenced by data/project.json; browser storage is not the project home. Native undo is session state; Growth preserves saved versions. App Tools inspect the scene, name the project and rename an entity. Source, pinned lockfile and notices travel with the Crux. npm ci && npm run build:garden rebuilds the local runtime. See UPSTREAM.md.',
};
export default template;
