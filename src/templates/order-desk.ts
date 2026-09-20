import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
import { CLIENT_PATH, CLIENT_SOURCE } from '@/services/crux-functions';

/**
 * The Order Desk template (CRUX-FUNCTIONS-PLAN): a small shop's order queue
 * whose backend is the crux itself — the Store keeps the orders, seven
 * functions are the only way they change, a Store hook refuses the page
 * writing them directly. The worked example of "an app with a backend"
 * that works in the workspace preview before it is shared.
 */
const sources = import.meta.glob(
  [
    '../../order-desk-crux/{index.html,style.css,app.js,README.md}',
    '../../order-desk-crux/functions/*.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../order-desk-crux/', ''),
      content,
    })),
    { path: CLIENT_PATH, content: CLIENT_SOURCE },
  ],
  skill: 'order-desk',
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    "Your Order Desk is open. The page takes orders; the crux's own functions number them, keep the queue in the Store and refuse anyone but you changing an order's status — a backend with nothing to host. Place an order in the preview, mark it ready, and watch the queue follow. The Share pane's Functions section runs each handler by hand. Ask me to change the menu, add a field to the form, or hook something to order:placed.",
};
export default template;
