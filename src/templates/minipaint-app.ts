import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const sources = import.meta.glob(
  '../../minipaint-crux/{src/**/*,garden/*,package.json,package-lock.json,webpack.config.js,index.html,.babelrc,MIT-LICENSE.txt,README.md,UPSTREAM.md}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob('../../minipaint-crux/{images,runtime}/**/*', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../minipaint-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../minipaint-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'minipaint', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'This is miniPaint: open an image, paint, add text, arrange layers and use the native image or layered JSON export. Your editable project saves with this Crux.',
  context:
    'Actual miniPaint 4.14.3 source and interface. data/project.json contains its native layered project in a Garden envelope; image pixels are immutable data/assets Artifacts. Keep the native format. Use inspect_minipaint and update_minipaint_layer while the editor is open. Use a Task to customize source and npm ci / npm run build to rebuild runtime/bundle.js. Local editing and native exports are supported; whole-editor website publication is unavailable. See UPSTREAM.md for limitations.',
};
export default template;
