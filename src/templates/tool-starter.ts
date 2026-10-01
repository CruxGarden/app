import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
import type { CruxToolManifest } from '@/services/crux-tools/manifest';
import html from './tool-starter/index.html?raw';
import client from './tool-starter/client.js?raw';
import license from '../../LICENSE?raw';
import readme from './tool-starter/README.md?raw';

export const starterManifest: CruxToolManifest = {
  version: 1,
  releaseVersion: '1.0.0',
  id: 'pocket-notes',
  name: 'Pocket Notes',
  description: 'A tiny editable notebook. Make the tool your own and share it.',
  kind: 'webapp',
  defaultTitle: 'My Pocket Notes',
  icon: 'pencil',
  desktopOnly: true,
  order: 1000,
  bundled: false,
  app: 'pocket-notes',
  entryFile: 'index.html',
  contentRoot: 'data/',
  layout: 'workshop',
  document: { path: 'data/project.json', seed: { version: 1, app: 'pocket-notes', text: '' } },
  share: false,
  toolInfo: {
    name: 'Pocket Notes',
    upstream: 'https://crux.garden',
    relationship:
      'An editable Crux Garden tool starter. Replace this credit with your own provenance.',
    detailsPath: 'UPSTREAM.md',
  },
  routes: [],
  greeting:
    'Make a tool of your own. Open README.md in Artifacts for the authoring and sharing steps.',
  context:
    'A custom tool starter. Edit its HTML and manifest; preserve the fingerprint-based document save contract.',
};
const template: TemplateDefinition = {
  files: [
    { path: 'index.html', content: html },
    { path: 'garden/client.js', content: client },
    { path: 'crux-tool.json', content: JSON.stringify(starterManifest, null, 2) },
    { path: 'data/project.json', content: JSON.stringify(starterManifest.document!.seed) },
    { path: 'README.md', content: readme },
    { path: 'LICENSE', content: license },
    {
      path: 'UPSTREAM.md',
      content:
        '# Pocket Notes\n\nBased on the MIT-licensed Crux Garden tool starter. Keep this attribution and document your changes and other dependencies.\n',
    },
  ],
  layout: LAYOUT_WORKSHOP,
  greeting: starterManifest.greeting,
  context: starterManifest.context,
  meta: {
    toolManifest: starterManifest,
    toolInfo: starterManifest.toolInfo,
    settings: { entryFile: 'index.html' },
  },
};
export default template;
