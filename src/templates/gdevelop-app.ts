import type { ToolTemplateFiles } from './index';
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
const template: ToolTemplateFiles = {
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
  ],
};
export default template;
