import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The actual Tigrana travels with the Crux: upstream's React source unchanged, the Garden
// storage and bridge under src/garden, the edition script, the pinned lockfile, the license,
// notes and the built runtime. Text stays text so the Crux is portable; the notebook starts
// with only its publication settings (Tigrana writes its Welcome note itself).
const sources = import.meta.glob(
  [
    '../../notes-crux/{index.html,package.json,package-lock.json,tsconfig.json,.eslintrc.cjs,vite.config.ts,README.md,UPSTREAM.md,CONTEXT.md,LICENSE,.cruxignore}',
    '../../notes-crux/{src,scripts,docs,notebook}/**/*',
    '!../../notes-crux/**/node_modules/**',
    '!../../notes-crux/**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  [
    '../../notes-crux/runtime/**/*',
    '!../../notes-crux/runtime/**/*.map',
    '../../notes-crux/tigrana-icon.png',
  ],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../notes-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../notes-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
  layout: LAYOUT_WRITING,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Your notebook is ready. Write in Use app; notes save as Markdown Artifacts with Growth checkpoints, in the same folder layout the desktop Tigrana uses. Import a notebook folder or choose the pages of the public edition from the bar below the app. Ask me to help with your notes—for example, “Set up a folder for writing a novel.”',
  context:
    'This is a Notes Crux (ADR 0028, ADR 0040): the actual Tigrana (downcastsystems/tigrana 1.0.8, upstream 8bc7100), its React app unchanged, running in its browser mode with the Garden’s NotebookStorage in place of its Rust side. The notebook is notebook/: Markdown notes and folders, .tigrana/metadata.json and per-folder .tigrana/folder.json sidecars, images under .assets — the desktop Tigrana’s own layout. Every write goes through the scoped crux:notebook bridge with a fingerprint guard and records Growth. notebook/publish.json holds the public edition choices; npm run build renders the chosen notes to static HTML in dist/ (single page with search, or separate pages) and, with format epub, the same notes as a book (dist/<title>.epub, offered for download on the public edition); save_notebook_book keeps that book as an output. Use the bridge for data, never the filesystem. See UPSTREAM.md.',
};
export default template;
