import { validateDrawingCommand } from '../../svgedit-crux/garden/commands.js';
import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const SVGEDIT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_svgedit',
    description:
      'Read the drawing title, dimensions, object count and the 20 objects with IDs, geometry, text and fills; use nextOffset for the next page.',
    input_schema: {
      type: 'object',
      properties: { offset: { type: 'integer', minimum: 0, maximum: 100000 } },
      required: [],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'set_svgedit_title',
    description: 'Set the native drawing title and save in Garden.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', minLength: 1, maxLength: 300 } },
      required: ['title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_svgedit_fill',
    description:
      'Change one existing shape fill through native undoable editing. Use a six-digit hex color or none.',
    input_schema: {
      type: 'object',
      properties: {
        elementId: { type: 'string', minLength: 1, maxLength: 300 },
        color: { type: 'string', pattern: '^(#[a-fA-F0-9]{6}|none)$' },
      },
      required: ['elementId', 'color'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
const attributes = {
  type: 'object',
  properties: Object.fromEntries([
    ...['x', 'y', 'cx', 'cy'].map((k) => [k, { type: 'number', minimum: -10000, maximum: 10000 }]),
    ...['width', 'height', 'rx', 'ry', 'font-size'].map((k) => [
      k,
      { type: 'number', exclusiveMinimum: 0, maximum: 10000 },
    ]),
    ['stroke-width', { type: 'number', minimum: 0, maximum: 100 }],
    ...['fill', 'stroke'].map((k) => [k, { type: 'string', pattern: '^(#[a-fA-F0-9]{6}|none)$' }]),
  ]),
  additionalProperties: false,
};
for (const [name, description, properties, required, writes] of [
  [
    'add_svgedit_shape',
    'Create a native undoable rect, ellipse or text object. Rect needs x/y/width/height; ellipse cx/cy/rx/ry; text x/y and literal text. Coordinates are SVG user units.',
    {
      type: { type: 'string', enum: ['rect', 'ellipse', 'text'] },
      attributes,
      text: { type: 'string', maxLength: 2000 },
    },
    ['type', 'attributes'],
    ['data/project.json'],
  ],
  [
    'set_svgedit_object',
    'Edit one object’s geometry, style or literal text through native controls. Inspect for its ID and shape type. Each changed attribute is undoable.',
    {
      elementId: { type: 'string', minLength: 1, maxLength: 300 },
      attributes,
      text: { type: 'string', maxLength: 2000 },
    },
    ['elementId'],
    ['data/project.json'],
  ],
  [
    'remove_svgedit_object',
    'Delete one object through native Undo. Inspect for the exact ID first.',
    { elementId: { type: 'string', minLength: 1, maxLength: 300 } },
    ['elementId'],
    ['data/project.json'],
  ],
  [
    'save_svgedit_svg',
    'Save the complete drawing as a reusable SVG output, including embedded images.',
    { name: { type: 'string', minLength: 1, maxLength: 120 } },
    ['name'],
    ['exports/'],
  ],
] as const)
  SVGEDIT_TOOLS.push({
    name,
    description,
    input_schema: {
      type: 'object',
      properties,
      required: [...required],
      additionalProperties: false,
    },
    writes: [...writes],
  });
export function svgeditCommand(name: string, input: Record<string, unknown>) {
  const op = (
    {
      inspect_svgedit: 'inspect',
      add_svgedit_shape: 'add-shape',
      set_svgedit_object: 'set-object',
      remove_svgedit_object: 'remove-object',
      save_svgedit_svg: 'save-svg',
    } as Record<string, string>
  )[name];
  if (op) {
    if (Object.hasOwn(input, 'op')) throw Error('Use documented drawing inputs.');
    return validateDrawingCommand({ ...input, op });
  }
  if (
    name === 'set_svgedit_title' &&
    Object.keys(input).length === 1 &&
    typeof input.title === 'string' &&
    input.title.trim() &&
    input.title.length <= 300
  )
    return { op: 'set-title', title: input.title };
  if (
    name === 'set_svgedit_fill' &&
    Object.keys(input).length === 2 &&
    typeof input.elementId === 'string' &&
    input.elementId &&
    input.elementId.length <= 300 &&
    typeof input.color === 'string' &&
    /^(#[a-fA-F0-9]{6}|none)$/.test(input.color)
  )
    return { op: 'set-fill', elementId: input.elementId, color: input.color };
  throw new Error('Choose an existing drawing object and a valid bounded edit.');
}
