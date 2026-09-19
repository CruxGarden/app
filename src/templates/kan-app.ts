import type { ToolTemplateFiles } from './index';
// Modified Kan source travels with the Crux (AGPL-3.0): the browser views,
// shared/API schema packages, the local Garden adaptation, tooling and notices.
// Hosted-only packages (database, email, billing, MCP, end-to-end) stay in the
// fork repository and upstream; the runtime never bundles them.
const assets = import.meta.glob(
  [
    '../../kan-crux/{package.json,package-lock.json,package.upstream.json,.npmrc,pnpm-workspace.yaml,pnpm-lock.yaml,turbo.json,vite.config.ts,index.html,LICENSE,UPSTREAM.md,README.md,CHANGELOG.md,CONTRIBUTING.md,.cruxignore,postcss.config.cjs,tailwind.config.ts,lingui.config.js}',
    '../../kan-crux/apps/web/**/*',
    '../../kan-crux/packages/{shared,api,auth}/**/*',
    '../../kan-crux/garden/**/*',
    '../../kan-crux/tooling/**/*',
    '../../kan-crux/runtime/**/*',
    '!../../kan-crux/**/node_modules/**',
    '!../../kan-crux/**/.git/**',
    '!../../kan-crux/**/.next/**',
    '!../../kan-crux/**/.turbo/**',
    '!../../kan-crux/**/.env*',
    '!../../kan-crux/**/*.css',
    '!../../kan-crux/**/*.map',
    '!../../kan-crux/**/.DS_Store',
    '!../../kan-crux/apps/web/{Dockerfile,entrypoint.sh}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob(
  [
    '../../kan-crux/apps/web/**/*.css',
    '../../kan-crux/garden/**/*.css',
    '../../kan-crux/runtime/**/*.css',
    '!../../kan-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../kan-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../kan-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
