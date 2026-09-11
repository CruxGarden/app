import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const sources = import.meta.glob(
  '../../jupyterlite-crux/{*.json,*.md,*.txt,LICENSE,.cruxignore,{scripts,garden,vendor}/**/*}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  ['../../jupyterlite-crux/runtime/**/*', '!../../jupyterlite-crux/runtime/**/*.css'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob('../../jupyterlite-crux/runtime/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../jupyterlite-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../jupyterlite-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'jupyterlite', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/lab/index.html' } },
  greeting:
    'Explore an idea in a Python notebook. Create a notebook from the native JupyterLite launcher, write code or Markdown, and run cells to calculate and plot. Garden saves your notebooks, outputs, files and folders automatically.',
  context:
    'Actual JupyterLite/JupyterLab browser application with Pyodide, NumPy and Matplotlib bundled. The editable configuration, Garden bridge and Python build scripts are included; rebuild with Python 3.10+ using npm run build. Native notebook/file hierarchy is stored in data/project.json with separate fingerprinted content Artifacts. inspect_jupyterlite and append_jupyterlite_cell operate on the active native notebook; code runs only through the native Run controls. Native .ipynb/file downloads remain. Kernel memory, temporary native checkpoints and UI preferences reset; notebook cells/outputs and Growth persist. Additional Python packages or authored network requests can require connectivity. Whole-editor publishing is unavailable. See UPSTREAM.md.',
};
export default template;
