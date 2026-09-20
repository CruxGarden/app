import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
import { CLIENT_PATH, CLIENT_SOURCE } from '@/services/crux-functions';

/**
 * The Garden template (GARDEN-MEMBERS-PLAN): a crux other people can belong
 * to. Its Store holds the people, the shelf and the notes; its functions are
 * the only way they change; the API contributes the directory and "which
 * gardens am I in". Kind `garden`, so Home lists it under Gardens.
 */
const sources = import.meta.glob(
  [
    '../../garden-crux/{index.html,style.css,app.js,README.md}',
    '../../garden-crux/functions/*.js',
    '../../garden-crux/functions/NOTES.md',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../garden-crux/', ''),
      content,
    })),
    { path: CLIENT_PATH, content: CLIENT_SOURCE },
  ],
  skill: 'garden',
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' }, kind: 'garden' },
  greeting:
    "A garden with people in it is planted. Share it to open the door; name it on its page; invite people from the directory by @name, and they appear on Home under Gardens with an invitation to accept. Members put their published cruxes on the shelf and leave notes to each other. The people, the shelf and the notes live in this crux's Store and change only through its functions — see README.md. Ask me to change what the garden shows, or add a rule.",
};
export default template;
