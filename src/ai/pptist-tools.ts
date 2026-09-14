import { validateCommand } from '../../pptist-crux/garden/commands.js';
import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const PPTIST_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_pptist',
    description:
      'Inspect the open PPTist presentation: title, size and a bounded slide list. Pass slideId to inspect element IDs, plain text and geometry. offset/limit page through slides or elements (default 20, maximum 50).',
    input_schema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: [],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'set_pptist_title',
    description: 'Set the presentation title (up to 200 characters) and save.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_pptist_slide',
    description:
      'Append a slide, with an optional text block (up to 2000 characters), and save. Never starts the presentation.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 1, maxLength: 2000 } },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_pptist_text',
    description:
      'Add an editable text box to an existing slide. Inspect for slideId and canvas size; coordinates and fontSize are in slide pixels. Newlines become paragraphs. Uses native Undo and confirmed save.',
    input_schema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        left: { type: 'number', minimum: -10000, maximum: 10000 },
        top: { type: 'number', minimum: -10000, maximum: 10000 },
        width: { type: 'number', minimum: 1, maximum: 10000 },
        height: { type: 'number', minimum: 1, maximum: 10000 },
        fontSize: { type: 'number', minimum: 8, maximum: 300 },
        color: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
      },
      required: ['slideId', 'text', 'left', 'top', 'width', 'height'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'edit_pptist_element',
    description:
      'Revise an existing native element by slideId and elementId from inspection. Move, resize or rotate it; for text, replace one unique exact phrase using find/replace, preserving other text and formatting. Locked elements are refused. Uses native Undo and saves.',
    input_schema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        elementId: { type: 'string' },
        find: { type: 'string', minLength: 1, maxLength: 2000 },
        replace: { type: 'string', maxLength: 2000 },
        left: { type: 'number', minimum: -10000, maximum: 10000 },
        top: { type: 'number', minimum: -10000, maximum: 10000 },
        width: { type: 'number', minimum: 1, maximum: 10000 },
        height: { type: 'number', minimum: 1, maximum: 10000 },
        rotate: { type: 'number', minimum: -360, maximum: 360 },
      },
      required: ['slideId', 'elementId'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'delete_pptist_element',
    description:
      'Remove one unlocked element by slideId and elementId from inspection. Native Undo can restore it; saves the presentation.',
    input_schema: {
      type: 'object',
      properties: { slideId: { type: 'string' }, elementId: { type: 'string' } },
      required: ['slideId', 'elementId'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'move_pptist_slide',
    description:
      'Move an existing slide to a zero-based position in the presentation. Other slides and their elements are preserved. Native Undo and save.',
    input_schema: {
      type: 'object',
      properties: { slideId: { type: 'string' }, index: { type: 'integer', minimum: 0 } },
      required: ['slideId', 'index'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'delete_pptist_slide',
    description:
      'Remove a slide by ID. Keeps at least one slide; native Undo can restore it. Saves the presentation.',
    input_schema: {
      type: 'object',
      properties: { slideId: { type: 'string' } },
      required: ['slideId'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'save_pptist_presentation',
    description:
      'Save the current editable deck as a PPTX output of this Crux using PPTist’s native exporter. Confirms project and output saves. Does not start a slideshow.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
    timeoutMs: 120000,
  },
];
const operations: Record<string, string> = {
  save_pptist_presentation: 'save-presentation',
  inspect_pptist: 'inspect',
  set_pptist_title: 'set-title',
  add_pptist_slide: 'add-slide',
  add_pptist_text: 'add-text',
  edit_pptist_element: 'edit-element',
  delete_pptist_element: 'delete-element',
  move_pptist_slide: 'move-slide',
  delete_pptist_slide: 'delete-slide',
};
export function pptistCommand(name: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations, name) || Object.hasOwn(input, 'op'))
    throw new Error('Choose a supported PPTist operation.');
  return validateCommand({ ...input, op: operations[name] });
}
