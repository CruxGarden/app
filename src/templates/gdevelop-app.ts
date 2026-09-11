import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const assets = import.meta.glob(
  [
    '../../gdevelop-crux/{package.json,tsconfig.json,LICENSE.md,UPSTREAM.md,CMakeLists.txt,.cruxignore}',
    '../../gdevelop-crux/{garden,Core,GDJS,Extensions,ExtLibs,GDevelop.js,SharedLibs}/**/*',
    '../../gdevelop-crux/newIDE/app/{src,scripts,patches,public}/**/*',
    '../../gdevelop-crux/newIDE/app/{*.json,*.js,*.md,.babelrc.json,.linguirc,.flowconfig}',
    '../../gdevelop-crux/newIDE/electron-app/app/package.json',
    '../../gdevelop-crux/Binaries/embuild/GDevelop.js/{libGD.js,libGD.wasm}',
    '../../gdevelop-crux/runtime/**/*',
    '!../../gdevelop-crux/**/node_modules/**',
    '!../../gdevelop-crux/**/.git/**',
    '!../../gdevelop-crux/**/.env*',
    '!../../gdevelop-crux/**/*.css',
    '!../../gdevelop-crux/**/tests/**',
    '!../../gdevelop-crux/**/__tests__/**',
    '!../../gdevelop-crux/**/.DS_Store',
    '!../../gdevelop-crux/newIDE/app/src/stories/**',
    '!../../gdevelop-crux/newIDE/app/public/external/{piskel/piskel-editor,jfxr/jfxr-editor,yarn/yarn-editor,monaco-editor-min,zip.js,zlib-asm}/**',
    '!../../gdevelop-crux/newIDE/app/public/external/**/*.zip',
    '!../../gdevelop-crux/newIDE/app/public/{libGD.js,libGD.wasm,service-worker.js}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob(
  [
    '../../gdevelop-crux/newIDE/app/{src,public}/**/*.css',
    '../../gdevelop-crux/runtime/**/*.css',
    '!../../gdevelop-crux/newIDE/app/public/external/{piskel/piskel-editor,jfxr/jfxr-editor,yarn/yarn-editor,monaco-editor-min,zip.js,zlib-asm}/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../gdevelop-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../gdevelop-crux/', ''),
      content,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'gdevelop', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Build scenes, objects and events with GDevelop. Garden keeps the editable game and imported assets. Preview plays the game here; Export web game creates a playable ZIP. Export complete Crux carries the editor, project and Growth together.',
  context:
    'Native GDevelop 5.6.282 web editor. data/project.json references separate native document, original media and preference Artifacts. IndexedDB is a generated preview cache. Import original files from your device. Use Garden Collaboration and Growth; upstream hosted accounts, builds, store and Spine runtime are not supplied. Scoped App Tools inspect the game, name it and set a scene background. npm run setup installs pinned dependencies and rebuilds the editor; npm run build reuses dependencies. See UPSTREAM.md for current adaptation scope and verification status. Whole-editor publication is unavailable.',
};
export default template;
