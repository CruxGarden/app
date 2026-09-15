import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  files: [
    {
      path: 'figma/project.json',
      content: JSON.stringify({ version: 1, app: 'figma', documentUrl: null }, null, 2),
    },
    {
      path: 'brief.md',
      content:
        '# Design brief\n\nWhat are we making, who is it for, and what should we preserve as we revise it?\n',
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { verifyOnDone: false } },
  greeting:
    'Work together in Figma, with your brief and exported assets here. Link a Figma file in Workshop, open it beside Garden, and bring exports back as outputs for your Cruxspace.',
  context:
    'Figma external-app POC. figma/project.json holds the external document reference; brief.md holds the creative brief. The actual editable canvas lives in Figma. Opening or arranging windows does not connect MCP. Use Figma tools only through a supported authenticated connection, inspect the current document before editing and preserve intervening manual edits. A downloaded export can be imported as a Cruxspace output. Growth preserves local files/exports, not remote Figma history. Never claim Figma edits or a complete remote backup from local file changes alone.',
};
export default template;
