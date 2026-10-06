import type { ToolTemplateFiles } from './index';
// The actual PPTist editor travels with the Crux (AGPL-3.0): Vue source, fonts,
// bundled templates, the Garden bridge, the pinned lockfile, the built runtime and notices.
const assets = import.meta.glob(
  [
    '../../pptist-crux/{package.json,package-lock.json,index.html,vite.config.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,env.d.ts,components.d.ts,LICENSE,UPSTREAM.md,README.md,.cruxignore}',
    '../../pptist-crux/{src,public,garden,runtime}/**/*',
    '!../../pptist-crux/**/node_modules/**',
    '!../../pptist-crux/**/*.css',
    '!../../pptist-crux/**/*.scss',
    '!../../pptist-crux/**/*.map',
    '!../../pptist-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
// Stylesheets and SCSS sources stay text: the host's Vite must not preprocess the fork's SCSS.
const styles = import.meta.glob(
  [
    '../../pptist-crux/runtime/**/*.css',
    '../../pptist-crux/src/**/*.css',
    '../../pptist-crux/src/**/*.scss',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../pptist-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../pptist-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
