import type { ToolTemplateFiles } from './index';
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
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../beepbox-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
