import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
import { CLIENT_PATH, CLIENT_SOURCE } from '@/services/crux-functions';

const sources = import.meta.glob(
  [
    '../../private-requests-crux/{index.html,style.css,app.js,README.md}',
    '../../private-requests-crux/functions/*.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../private-requests-crux/', ''),
      content,
    })),
    { path: CLIENT_PATH, content: CLIENT_SOURCE },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'Private Requests demonstrates visitor sign-in, Functions and protected Store records. Each customer has one editable request. In Workshop you are the local owner: save a test request, inspect the Owner inbox, then delete it when handled. Online customers sign in with the scoped email-code form and see only their own request. The creator handles online requests from Share → Optional enhancements → Functions. Read README.md for the owner commands and privacy boundary. Local test Garden is static-only.',
};
export default template;
