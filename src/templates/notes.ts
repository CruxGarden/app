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
    'Your notebook is ready. Write in the Workshop; notes save as Markdown Artifacts with Growth checkpoints. Create nested pages with paths such as Ideas/My project. Select pages to include in the public edition, then Publish when ready. Ask me to change the editor or help with your notes.',
  context:
    'This is a Notes Crux (ADR 0028), using a Tigrana-derived rich Markdown editor in an Astro shell. Notebook data lives in notebook/*.md and nested folders, images in notebook/assets/, and explicit publication choices in notebook/publish.json. Editor sources live in src/. The scoped crux:notebook postMessage bridge writes only notebook Artifacts. Never replace this with localStorage. npm run build makes a read-only edition from selected pages only. Keep private notebook content out of src/ and public/. Do not add automatic source, conversation, or thumbnail sharing. Use a Task for editor customization; change only app sources to preserve newer notes on Main. Whole Growth restore includes both app and notes. Tigrana MIT notices must be retained.',
};
export default template;
