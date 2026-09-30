import { LAYOUT_WRITING, type TemplateDefinition } from './index';
const sources = import.meta.glob(
  '../../examples/zen-vibecoding/{index.html,style.css,app.mjs,missions.mjs,README.md,garden/**/*}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  greeting: '',
  context:
    'An instructional game about real Tasks and agents. Read README.md and the mission before working. Never complete missions on behalf of the player without being asked.',
  meta: { messages: [], settings: { entryFile: 'index.html' } },
  layout: LAYOUT_WRITING,
  files: Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../examples/zen-vibecoding/', ''),
    content,
  })),
};
export default template;
