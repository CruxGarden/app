import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateCommand } from '../../piskel-crux/src/garden/commands.js';
const index = { type: 'integer', minimum: 0, maximum: 1999 };
const frameId = { type: 'string', minLength: 1, maxLength: 16 };
const project = ['data/project.json', 'data/assets/'];
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  writes = project,
): AppToolDefinition {
  return {
    name,
    description,
    input_schema: { type: 'object', properties, required, additionalProperties: false },
    writes,
  };
}
export const PISKEL_TOOLS: AppToolDefinition[] = [
  tool(
    'inspect_piskel',
    'Inspect native sprite dimensions, layers, speed and a bounded pixel region. Defaults to the selected layer/frame and top-left 16×16 region; request up to 32×32. Pixel rows index the returned color palette. frameList pages 20 frames with offset. Native frame IDs and expectedHash are session-local: inspect again after edits, Undo or reopening.',
    {
      layerIndex: { type: 'integer', minimum: 0, maximum: 99 },
      frameIndex: index,
      x: { type: 'integer', minimum: 0, maximum: 4095 },
      y: { type: 'integer', minimum: 0, maximum: 4095 },
      width: { type: 'integer', minimum: 1, maximum: 32 },
      height: { type: 'integer', minimum: 1, maximum: 32 },
      offset: index,
    },
    [],
    [],
  ),
  tool(
    'paint_piskel_pixels',
    'Paint or erase 1–4096 distinct pixels in one native layer/frame as one Undo step. Use expectedHash from inspection; rejects stale frames and out-of-bounds pixels before editing. Changes only listed coordinates and preserves all other pixels, layers and frames. Opaque #RRGGBB or transparent; coordinates are zero-based.',
    {
      layerIndex: { type: 'integer', minimum: 0, maximum: 99 },
      frameIndex: index,
      expectedHash: { type: 'string', minLength: 3, maxLength: 64 },
      pixels: {
        type: 'array',
        minItems: 1,
        maxItems: 4096,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y', 'color'],
          properties: {
            x: { type: 'integer', minimum: 0, maximum: 4095 },
            y: { type: 'integer', minimum: 0, maximum: 4095 },
            color: { type: 'string', pattern: '^(#[a-fA-F0-9]{6}|transparent)$' },
          },
        },
      },
    },
    ['layerIndex', 'frameIndex', 'expectedHash', 'pixels'],
  ),
  tool(
    'insert_piskel_frame',
    'Insert one empty animation frame across every native layer at a zero-based position (frame count means append). Selects the inserted frame. Native Undo and confirmed save; existing pixels remain.',
    { index: { ...index, maximum: 2000 } },
    ['index'],
  ),
  tool(
    'duplicate_piskel_frame',
    'Duplicate the frameId from inspection across all native layers immediately after its source. Selects the duplicate; native Undo and confirmed save. Inspect the new frame before painting.',
    { frameId },
    ['frameId'],
  ),
  tool(
    'move_piskel_frame',
    'Move the inspected frameId to an existing zero-based frame position across all layers using native history. Inspect again after rearranging.',
    { frameId, index },
    ['frameId', 'index'],
  ),
  tool(
    'delete_piskel_frame',
    'Delete the inspected frameId across every layer, retaining at least one frame. Native Undo and confirmed save. A hidden frame must first be shown using the native frame list.',
    { frameId },
    ['frameId'],
  ),
  tool(
    'set_piskel_speed',
    'Set native animation speed to 1–24 frames per second and confirm save. Matches the native speed control; speed changes do not create a separate Undo step.',
    { fps: { type: 'integer', minimum: 1, maximum: 24 } },
    ['fps'],
  ),
  tool(
    'save_piskel_sheet',
    'Save the sprite, then render its complete native animation as a PNG sprite sheet output. Returns dimensions, frames, columns and rows for using it in another Crux. Matches Save sheet to Cruxspace.',
    { name: { type: 'string', minLength: 1, maxLength: 120 } },
    ['name'],
    [...project, 'exports/'],
  ),
];
const operations: Record<string, string> = {
  inspect_piskel: 'inspect',
  paint_piskel_pixels: 'paint',
  insert_piskel_frame: 'insert-frame',
  duplicate_piskel_frame: 'duplicate-frame',
  move_piskel_frame: 'move-frame',
  delete_piskel_frame: 'delete-frame',
  set_piskel_speed: 'fps',
  save_piskel_sheet: 'save-sheet',
};
export function piskelCommand(name: string, input: Record<string, unknown>) {
  if (
    !Object.hasOwn(operations, name) ||
    Object.hasOwn(input, 'op') ||
    Object.hasOwn(input, 'label')
  )
    throw new Error('Choose a supported sprite operation.');
  const command = { ...input, op: operations[name] };
  if (name === 'save_piskel_sheet') {
    const { name: label, ...rest } = command as Record<string, unknown>;
    return validateCommand({ ...rest, label });
  }
  return validateCommand(command);
}
