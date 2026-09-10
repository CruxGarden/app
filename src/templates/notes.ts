import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';

// Actual editable sources; dependencies and output never enter the Crux.
const sources = import.meta.glob(
  '../../notes-crux/{src/**/*,scripts/edition.mjs,public/*,notebook/*,package.json,package-lock.json,astro.config.mjs,tsconfig.json,README.md,TIGRANA-LICENSE}',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../notes-crux/', ''),
    content,
  })),
  layout: LAYOUT_WRITING,
  meta: { settings: { entryFile: 'src/pages/index.astro' } },
  greeting:
    'Your notebook is ready. Write in Use app or import a notebook folder; notes save as Markdown Artifacts with Growth checkpoints. Ask me to help with your notes—for example, “Set up a folder for writing a novel.” Use Customize app for changes to the editor itself. Select pages in the app, then use Share selected content when ready.',
  context:
    'This is a Notes Crux (ADR 0028), using a Tigrana-derived rich Markdown editor in an Astro shell. Notebook data lives in notebook/*.md and nested folders; imported notebooks live under notebook/Imported/ with relative links, raster images and .tigrana metadata preserved. Publication choices live in notebook/publish.json. Editor sources live in src/. For requests to use the app (organize notes, plan a novel, create chapters), work on Markdown in notebook/ and preserve existing frontmatter and relative links. Do not change editor sources for a content request or automatically select notes for sharing. The scoped crux:notebook postMessage bridge writes only notebook Artifacts. Never replace this with localStorage. npm run build makes a read-only edition from selected pages only. Keep private notebook content out of src/ and public/. Do not add automatic source, conversation, or thumbnail sharing. Use a Task for editor customization; change only app sources to preserve newer notes on Main. Whole Growth restore includes both app and notes. Tigrana MIT notices must be retained.',
};
export default template;
