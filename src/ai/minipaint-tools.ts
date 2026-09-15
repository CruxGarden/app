import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { FONTS, BLEND_MODES, validateCommand } from '../../minipaint-crux/garden/commands.js';

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
const stroke = {
  points: {
    type: 'array',
    minItems: 1,
    maxItems: 1000,
    items: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'number', minimum: -32768, maximum: 32768 },
    },
  },
  size: { type: 'number', minimum: 1, maximum: 256 },
  opacity: { type: 'number', minimum: 0, maximum: 100 },
} as const;
export const MINIPAINT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_minipaint',
    description:
      'Inspect canvas size and native layers, back to front: IDs, names, geometry, visibility, opacity, composition, text, live filters with IDs/values, brush summaries, native history availability and available image Artifact paths, original raster dimensions and the active native rectangular selection (canvas coordinates; session-local). Bounded to 20 layers by default; page with offset/limit (maximum 50).',
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
      'Revise a native layer by ID from inspection: name, visibility, opacity, native composition/blend mode or geometry. source-atop uses the native clipping behavior; other modes follow Canvas compositing. Text layers also accept fontSize/fontFamily/color and one unique exact find/replace phrase, preserving other text and formatting. Rectangle color changes its fill. Uses native Undo and confirmed save.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: layerName,
        visible: { type: 'boolean' },
        composition: { type: 'string', enum: BLEND_MODES },
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
    name: 'paint_minipaint_stroke',
    description:
      'Paint one smooth, round, constant-width native brush stroke as a separate editable layer. points are 1–1000 [x,y] pairs in canvas pixels; one point paints a dot. Supports color, size and opacity. Inspect canvas first; move, hide, reorder or delete the returned layer independently. Native Undo and confirmed save.',
    input_schema: {
      type: 'object',
      properties: {
        name: layerName,
        points: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          items: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: { type: 'number', minimum: -32768, maximum: 32768 },
          },
        },
        size: { type: 'number', minimum: 1, maximum: 256 },
        color: style.color,
        opacity: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['points', 'size'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'select_minipaint_region',
    description:
      'Set or clear the native rectangular selection on an unrotated image layer. Set needs x/y/width/height in canvas pixels and selects that layer/tool so the person can continue manually. Clear needs only id/action. Selection is session-local and is not saved in exported projects; shared native Undo restores it. Inspect again before selection edits.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        action: { type: 'string', enum: ['set', 'clear'] },
        ...geometry,
      },
      required: ['id', 'action'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'erase_minipaint_pixels',
    description:
      'Erase original pixels on an unrotated raster image layer, retaining its geometry and live filters. mode=stroke needs points/size in canvas pixels (round constant-width stroke; one point is a dot); mode=selection erases the currently inspected native rectangle. opacity defaults to 100%. Display scaling/position are handled. Stroke ignores selection; rectangular edits round outward to whole original pixels. Native Undo and confirmed save; original source Artifact stays intact.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        mode: { type: 'string', enum: ['stroke', 'selection'] },
        ...stroke,
      },
      required: ['id', 'mode'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'fill_minipaint_pixels',
    description:
      'Fill original pixels on an unrotated raster layer with a hex color. contiguous fills four-connected pixels matching the seed x/y in canvas coordinates; global fills all matching pixels on that layer; selection fills the inspected native rectangle without a seed. tolerance is 0–100 percent per RGBA channel (default 0); opacity is source-over 0–100% (default 100). Matching uses original pixels before live filters. Seed fills ignore selection; rectangular edges round outward to original pixels. Hard-edged fill, no feathering. Native Undo and confirmed save; source Artifact and other layers stay intact.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        mode: { type: 'string', enum: ['contiguous', 'global', 'selection'] },
        x: geometry.x,
        y: geometry.y,
        color: style.color,
        opacity: stroke.opacity,
        tolerance: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['id', 'mode', 'color'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'duplicate_minipaint_layer',
    description:
      'Duplicate a native layer in place by inspected ID, preserving editable text, brush data, filters or original raster pixels. Optionally name the copy. Returns createdLayerId. Useful for retaining an original photo before editing. Native Undo and confirmed save.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' }, name: layerName },
      required: ['id'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'edit_minipaint_filter',
    description:
      'Add, update or remove a native live layer filter without rewriting original pixels. Inspect filter IDs and order first. add needs filter/value; update also needs filterId and must keep its type; remove needs only filterId. Brightness/contrast/saturate: -100..100 (0 neutral); hue-rotate: 0..360 degrees; blur: 0..50 pixels; grayscale/sepia/invert: 0..100 percent. Unrelated filters/order stay intact. One native Undo step and confirmed save.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        action: { type: 'string', enum: ['add', 'update', 'remove'] },
        filterId: { type: 'integer', minimum: 1 },
        filter: {
          type: 'string',
          enum: [
            'brightness',
            'contrast',
            'saturate',
            'hue-rotate',
            'blur',
            'grayscale',
            'sepia',
            'invert',
          ],
        },
        value: { type: 'number', minimum: -100, maximum: 360 },
      },
      required: ['id', 'action'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'crop_minipaint_canvas',
    description:
      'Crop to an integer rectangle inside the current canvas: x/y identify its top-left, width/height its size. Moves every layer to the new canvas origin, retaining off-canvas pixels and editable content. No resampling. Native Undo restores canvas and all layer positions together; confirms save.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer', minimum: 0, maximum: 8191 },
        y: { type: 'integer', minimum: 0, maximum: 8191 },
        width: { type: 'integer', minimum: 1, maximum: 8192 },
        height: { type: 'integer', minimum: 1, maximum: 8192 },
      },
      required: ['x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'rasterize_minipaint_layer',
    description:
      'Convert one inspected text, shape, brush or image layer into editable raster pixels using the native renderer. Bakes rotation, geometry and live filters within the current canvas bounds; off-canvas pixels are clipped. Keeps visibility, opacity, blend mode and stack position; returns a new createdLayerId. Hidden layers can be rasterized without becoming visible. Text/shape data is replaced: duplicate first if needed. One native Undo restores the editable original. Confirms PNG pixels and project save.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' }, name: layerName },
      required: ['id'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'merge_minipaint_layers',
    description:
      'Combine layers into one editable raster at canvas size; bakes filters/opacity and clips off-canvas content. selected requires 2–500 adjacent visible layer IDs with source-over composition; backdrop-dependent blends refuse. visible uses the native complete composite of all visible layers, preserving hidden layers separately in their existing order (revealing them cannot restore their old interleaving with merged layers). The result occupies the highest replaced position with normal composition and 100% opacity. Returns createdLayerId. Source layers are replaced; duplicate first if needed. One native Undo restores all original layers, order and editing data. Confirms project and pixels save.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['selected', 'visible'] },
        ids: {
          type: 'array',
          minItems: 2,
          maxItems: 500,
          uniqueItems: true,
          items: { type: 'integer' },
        },
        name: layerName,
      },
      required: ['mode'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'minipaint_history',
    description:
      'Undo or redo one native editor transaction, including person or agent edits. Inspect canUndo/canRedo first; this session-local history resets when the app reloads. Saves the restored project. This affects the latest edit, not necessarily your own.',
    input_schema: {
      type: 'object',
      properties: { direction: { type: 'string', enum: ['undo', 'redo'] } },
      required: ['direction'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
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
// A blank editor may be initialized without inspection. Once artwork exists,
// the native boundary requires a returned state token, including for insertions.
for (const tool of MINIPAINT_TOOLS) {
  if (tool.name === 'inspect_minipaint') {
    tool.description +=
      ' Returns a session-local stateToken for the next edit; inspection does not encode the raster again.';
    continue;
  }
  tool.input_schema.properties = {
    ...tool.input_schema.properties,
    expectedState: {
      type: 'string',
      maxLength: 128,
      pattern: '^mp:[A-Za-z0-9-]+:[1-9][0-9]*$',
      description:
        'stateToken from the latest inspection or successful miniPaint result. Required once the canvas contains artwork.',
    },
  };
  tool.description +=
    ' Pass expectedState from the latest miniPaint result; stale or missing state refuses once artwork exists. Inspect again after manual edits, selection changes, Undo or reload. View-only zoom does not invalidate it.';
}
const operations: Record<string, string> = {
  rasterize_minipaint_layer: 'rasterize-layer',
  merge_minipaint_layers: 'merge-layers',
  select_minipaint_region: 'selection',
  erase_minipaint_pixels: 'erase',
  fill_minipaint_pixels: 'fill',
  paint_minipaint_stroke: 'add-brush',
  duplicate_minipaint_layer: 'duplicate-layer',
  edit_minipaint_filter: 'edit-filter',
  crop_minipaint_canvas: 'crop-canvas',
  minipaint_history: 'history',
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
    if (
      Object.keys(input).some((key) => !['name', 'expectedState'].includes(key)) ||
      typeof input.name !== 'string'
    )
      throw new Error('Name the image output.');
    return validateCommand({
      op: 'save-image',
      label: input.name.trim(),
      ...(input.expectedState === undefined ? {} : { expectedState: input.expectedState }),
    });
  }
  return validateCommand({ ...input, op: operations[name] });
}
