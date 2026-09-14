import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { FONTS, validateCommand } from '../../minipaint-crux/garden/commands.js';

const geometry = {
  x: { type: 'number', minimum: -32768, maximum: 32768 },
  y: { type: 'number', minimum: -32768, maximum: 32768 },
  width: { type: 'number', minimum: 1, maximum: 8192 },
  height: { type: 'number', minimum: 1, maximum: 8192 },
} as const;
const style = {
  fontSize: { type: 'number', minimum: 8, maximum: 256 },
  fontFamily: { type: 'string', enum: FONTS },
  color: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
} as const;
const layerName = { type: 'string', maxLength: 200 } as const;
export const MINIPAINT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_minipaint',
    description:
      'Inspect canvas size and native layers, back to front: IDs, names, geometry, visibility, opacity, text and available image Artifact paths. Bounded to 20 layers by default; page with offset/limit (maximum 50).',
    input_schema: {
      type: 'object',
      properties: {
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: [],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'update_minipaint_layer',
    description:
      'Revise a native layer by ID from inspection: name, visibility, opacity or geometry. Text layers also accept fontSize/fontFamily/color and one unique exact find/replace phrase, preserving other text and formatting. Rectangle color changes its fill. Uses native Undo and confirmed save.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: layerName,
        visible: { type: 'boolean' },
        opacity: { type: 'number', minimum: 0, maximum: 100 },
        ...geometry,
        rotate: { type: 'number', minimum: -360, maximum: 360 },
        ...style,
        find: { type: 'string', minLength: 1, maxLength: 2000 },
        replace: { type: 'string', maxLength: 2000 },
      },
      required: ['id'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_minipaint_text',
    description:
      'Add an editable text layer with wrapping inside the specified box, in canvas pixels. Newlines become text lines. Supports local font families, size and hex color; defaults to 40px Arial. Native Undo and save.',
    input_schema: {
      type: 'object',
      properties: {
        name: layerName,
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        ...geometry,
        ...style,
      },
      required: ['text', 'x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_minipaint_rectangle',
    description:
      'Add an editable filled rectangle layer, useful for a banner background or panel. Coordinates are canvas pixels; color defaults to #eeeeee. Native Undo and save.',
    input_schema: {
      type: 'object',
      properties: { name: layerName, ...geometry, color: style.color },
      required: ['x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_minipaint_image',
    description:
      'Import a PNG, JPEG or WebP Artifact from this Crux as an editable image layer at the supplied geometry. Use list_files or an image path from inspect_minipaint. No remote URLs. The native project stores decoded pixels losslessly; source Artifact stays intact. Native Undo and confirmed save.',
    input_schema: {
      type: 'object',
      properties: {
        name: layerName,
        path: { type: 'string', minLength: 1, maxLength: 240 },
        ...geometry,
      },
      required: ['path', 'x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'resize_minipaint_canvas',
    description:
      'Resize the canvas (integer pixels; at most 8192 per side and 32 megapixels). By default crop/expand from the top-left without deleting layer content. scaleLayers=true scales layer positions/sizes and text sizes with the canvas. One native Undo step and save.',
    input_schema: {
      type: 'object',
      properties: {
        width: { type: 'integer', minimum: 1, maximum: 8192 },
        height: { type: 'integer', minimum: 1, maximum: 8192 },
        scaleLayers: { type: 'boolean' },
      },
      required: ['width', 'height'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'reorder_minipaint_layer',
    description:
      'Move one layer up (toward the front) or down (toward the back) in the native layer stack. Inspect IDs first. Native Undo and save.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' }, direction: { type: 'string', enum: ['up', 'down'] } },
      required: ['id', 'direction'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'delete_minipaint_layer',
    description:
      'Delete a layer by ID from inspection, keeping at least one layer. Native Undo restores it; confirms the project save.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'save_minipaint_image',
    description:
      'Render every visible layer to a PNG output of this Crux for use in a Cruxspace. Saves the editable layered project first; confirms the output save.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
  },
];
const operations: Record<string, string> = {
  inspect_minipaint: 'inspect',
  update_minipaint_layer: 'layer',
  add_minipaint_text: 'add-text',
  add_minipaint_rectangle: 'add-rectangle',
  add_minipaint_image: 'add-image',
  resize_minipaint_canvas: 'resize-canvas',
  reorder_minipaint_layer: 'reorder-layer',
  delete_minipaint_layer: 'delete-layer',
  save_minipaint_image: 'save-image',
};
export function minipaintCommand(name: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations, name) || Object.hasOwn(input, 'op'))
    throw new Error('Choose a supported miniPaint operation.');
  if (name === 'save_minipaint_image') {
    if (Object.keys(input).length !== 1 || typeof input.name !== 'string')
      throw new Error('Name the image output.');
    return validateCommand({ op: 'save-image', label: input.name.trim() });
  }
  return validateCommand({ ...input, op: operations[name] });
}
