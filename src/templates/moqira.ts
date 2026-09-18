import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The actual Moqira travels with the Crux: upstream React source with a narrow native App Tools hook, the Tauri
// stand-ins and Garden bridge under src/garden, the edition script, the pinned lockfile,
// notes and the built runtime. Text stays text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../moqira-crux/{index.html,package.json,package-lock.json,tsconfig.json,.eslintrc.cjs,vite.config.ts,README.md,UPSTREAM.md,CONTEXT.md,.cruxignore}',
    '../../moqira-crux/{src,scripts,docs,mockups}/**/*',
    '!../../moqira-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  [
    '../../moqira-crux/runtime/**/*',
    '!../../moqira-crux/runtime/**/*.map',
    '../../moqira-crux/moqira-icon.png',
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
      path: path.replace('../../moqira-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../moqira-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
  layout: LAYOUT_WRITING,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Your Moqira workspace is ready. Add controls to the canvas, create wireframes, and try Play mode. Save writes the project to this Crux with Growth history. Choose which wireframes belong in the public edition from the bar below the app.',
  context:
    'The actual Moqira (downcastsystems/moqira 1.0.3, upstream 0fbe079): its native React app with a narrow tool/history hook, believing it runs in Tauri while the Garden stands in for the Tauri modules. The project is mockups/project.json, read before the app starts and written by the app’s own Save (Cmd/Ctrl+S or the bar’s Save project); publication choices are mockups/publish.json; the public edition (npm run build) keeps only the chosen wireframes and opens read-only in interactive mode. Import a Moqira file through the app’s Open. Use App Tools to inspect the component catalogue and current state, then edit screens, controls, links or images through native history. Re-inspect after stale-state errors. Finish or cancel manual drafts before commands. save_moqira_project exports the full editable JSON including private screens; it does not publish. See UPSTREAM.md.',
};
export default template;
