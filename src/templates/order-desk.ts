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
    'Your Order Desk demonstrates Functions + Store. Use made-up names and notes: this is a public demo queue, not a private customer system. Place an order in Workshop, move it along as the local owner, and inspect its records in Store. Share → Optional enhancements → Functions runs handlers by hand. A static Local test Garden copy cannot run this backend. Published visitor sessions do not receive owner controls; see README.md before adapting it for customers.',
};
export default template;
