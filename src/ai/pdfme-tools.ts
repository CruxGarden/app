import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const PAGES = ['a4-portrait', 'a4-landscape', 'letter-portrait', 'letter-landscape', 'a5-portrait', 'square'];
const mm = { type: 'number', minimum: 0, maximum: 1000 } as const;
export const PDFME_TOOLS: AppToolDefinition[] = [
  { name: 'inspect_layout', description: 'Read the open layout: its name, page, and the blocks on the first page (name, type, content, position and size in millimetres).', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }, writes: [] },
  { name: 'set_layout_name', description: 'Name the layout and save it in Garden.', input_schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['name'], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'set_layout_page', description: 'Choose the page: a4-portrait, a4-landscape, letter-portrait, letter-landscape, a5-portrait or square.', input_schema: { type: 'object', properties: { page: { type: 'string', enum: PAGES } }, required: ['page'], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'add_layout_text', description: 'Add a text block to the first page at x/y (millimetres from the top-left) with width, height, optional font size (points) and alignment; saves the layout.', input_schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 60, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' }, text: { type: 'string', minLength: 1, maxLength: 5000 }, x: mm, y: mm, width: { type: 'number', minimum: 1, maximum: 1000 }, height: { type: 'number', minimum: 1, maximum: 1000 }, fontSize: { type: 'number', minimum: 4, maximum: 200 }, align: { type: 'string', enum: ['left', 'center', 'right'] } }, required: ['text', 'x', 'y', 'width', 'height'], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'save_layout_pdf', description: 'Render the layout to a PDF and save it as a named output of this Crux (exports/), for a Cruxspace member or a print.', input_schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 120 } }, required: ['name'], additionalProperties: false }, writes: ['data/project.json', 'exports/'] },
  { name: 'save_layout_image', description: 'Render the first page to a PNG (2×) and save it as a named output of this Crux (exports/), for a site or a notebook.', input_schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 120 } }, required: ['name'], additionalProperties: false }, writes: ['data/project.json', 'exports/'] },
];
export function pdfmeCommand(name: string, input: Record<string, unknown>) {
  const label = () => {
    if (Object.keys(input).length !== 1 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new Error('Name the output (up to 120 characters).');
    return input.name.trim();
  };
  if (name === 'inspect_layout' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'set_layout_name') {
    if (Object.keys(input).length !== 1 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new Error('Name the layout (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_layout_page') {
    if (Object.keys(input).length !== 1 || typeof input.page !== 'string' || !PAGES.includes(input.page)) throw new Error(`Choose a page: ${PAGES.join(', ')}.`);
    return { op: 'set-page', page: input.page };
  }
  if (name === 'add_layout_text') {
    const keys = Object.keys(input);
    if (keys.some((k) => !['name', 'text', 'x', 'y', 'width', 'height', 'fontSize', 'align'].includes(k))) throw new Error('A text block has name, text, x, y, width, height, fontSize and align only.');
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 5000) throw new Error('Give the block text (up to 5,000 characters).');
    for (const k of ['x', 'y', 'width', 'height']) if (typeof input[k] !== 'number' || !Number.isFinite(input[k] as number)) throw new Error(`${k} is a number in millimetres.`);
    return { op: 'add-text', ...input };
  }
  if (name === 'save_layout_pdf') return { op: 'save-pdf', label: label() };
  if (name === 'save_layout_image') return { op: 'save-image', label: label() };
  throw new Error(`Unknown layout tool ${name}.`);
}
