import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
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
const template: TemplateDefinition = {
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
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'kan', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Plan work with Kan. Make a board, add lists and cards, then track labels, due dates, checklists, comments and attachments. Garden preserves every board and original attachment together.',
  context:
    'Actual Kan kanban boards, pinned upstream 386cdcd. Native boards, lists, cards, labels, members, due dates and filters, checklists, comments, attachments, card duplication, archive and templates remain, for one local owner. Deleted records stay in history; each board is a separate fingerprinted record referenced by data/project.json, with original attachment bytes up to 64 MB each. App Tools inspect a board and create, rename or move cards. Kan cards are project planning; Garden Tasks and Tending are execution and review, and nothing synchronizes them automatically. Hosted accounts, invitations, board URLs, public visibility, Trello import, integrations and billing are excluded. Source, pinned lockfile and notices travel with the Crux; npm ci --ignore-scripts && npm run build rebuilds runtime/. See UPSTREAM.md.',
};
export default template;
