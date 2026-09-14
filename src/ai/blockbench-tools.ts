import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateCommand } from '../../blockbench-crux/garden/commands.js';
const name = { type: 'string', minLength: 1, maxLength: 200 };
const id = { type: 'string', minLength: 1, maxLength: 100 };
const vector = {
  type: 'array',
  minItems: 3,
  maxItems: 3,
  items: { type: 'number', minimum: -4096, maximum: 4096 },
};
const geometry = {
  from: vector,
  to: vector,
  origin: vector,
  rotation: { ...vector, items: { type: 'number', minimum: -360, maximum: 360 } },
};
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
    timeoutMs: 180000,
  };
}
export const BLOCKBENCH_TOOLS: AppToolDefinition[] = [
  tool(
    'inspect_blockbench',
    'Read the active native model, format, cube/group IDs, names, native model coordinates, hierarchy, texture IDs and animation summaries. Pages 25 parts by default, at most 50 with offset/limit; library/texture/animation summaries show the first 50. Inspect again after manual edits or Undo.',
    {
      offset: { type: 'integer', minimum: 0, maximum: 100000 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    [],
    [],
  ),
  tool(
    'create_blockbench_model',
    'Create and select a new native Generic Model without closing other model tabs. Confirms the model library save. Model creation is not an element Undo step.',
    { name },
    ['name'],
  ),
  tool(
    'set_blockbench_name',
    'Name the active native model and confirm save; matches native project naming, without a separate geometry Undo step.',
    { name },
    ['name'],
  ),
  tool(
    'rename_blockbench_element',
    'Rename an existing part by its ID from inspection through native Undo, preserving geometry, textures and other parts.',
    { elementId: id, name },
    ['elementId', 'name'],
  ),
  tool(
    'add_blockbench_cube',
    'Create a native cube in the active Generic Model, with positive-size from/to coordinates in model units. Optional origin and XYZ rotation in degrees, optional parent group ID (root by default). Native Undo, editable geometry and confirmed save. Uses native cube UV defaults; material/texture creation is still manual.',
    { name, ...geometry, parentId: id },
    ['name', 'from', 'to'],
  ),
  tool(
    'update_blockbench_cube',
    'Revise only supplied from/to/origin/rotation fields of a cube by inspected ID in the active Generic Model. Coordinates follow native cube from/to and pivot conventions; preserve names, face UVs, assigned textures, other parts and native Undo. Rejects nonpositive dimensions.',
    { elementId: id, ...geometry },
    ['elementId'],
  ),
  tool(
    'add_blockbench_group',
    'Add an empty native group to the active Generic Model, with optional origin and parent group ID. Existing parts are not silently moved into it. Native Undo and confirmed save.',
    { name, origin: vector, parentId: id },
    ['name'],
  ),
  tool(
    'move_blockbench_element',
    'Move a cube or group under a specified group ID, or root, in the active Generic Model. Retains stored geometry and pivot coordinates; a transformed parent can change its world appearance. Rejects cycles and uses native Undo.',
    { elementId: id, parentId: id },
    ['elementId', 'parentId'],
  ),
  tool(
    'delete_blockbench_element',
    'Delete one cube or empty group by inspected ID in the active Generic Model. Refuses groups with children; remove or move those explicitly. Native Undo restores the part.',
    { elementId: id },
    ['elementId'],
  ),
  ...(['model', 'gltf'] as const).map((format) =>
    tool(
      `save_blockbench_${format}`,
      format === 'model'
        ? 'Save the active native BBModel with embedded media as a reusable .bbmodel output. Matches Save model output; preserves the native editor and current model.'
        : 'Export the active model with Blockbench’s native glTF codec and embedded textures/buffers as a reusable .gltf output. Uses native export settings with ASCII encoding and embedded media, and rejects external asset references. Matches Save glTF output.',
      { name: { type: 'string', minLength: 1, maxLength: 120 } },
      ['name'],
      [...project, 'exports/'],
    ),
  ),
];
const operations: Record<string, string> = {
  inspect_blockbench: 'inspect',
  create_blockbench_model: 'create-model',
  set_blockbench_name: 'set-name',
  rename_blockbench_element: 'rename-element',
  add_blockbench_cube: 'add-cube',
  update_blockbench_cube: 'update-cube',
  add_blockbench_group: 'add-group',
  move_blockbench_element: 'move-element',
  delete_blockbench_element: 'delete-element',
  save_blockbench_model: 'save-model',
  save_blockbench_gltf: 'save-gltf',
};
export function blockbenchCommand(name: string, input: Record<string, unknown>) {
  if (
    !Object.hasOwn(operations, name) ||
    Object.hasOwn(input, 'op') ||
    Object.hasOwn(input, 'label')
  )
    throw new Error('Choose a supported native model operation.');
  const command: Record<string, unknown> = { ...input, op: operations[name] };
  if (name.startsWith('save_blockbench_')) {
    const { name: label, ...rest } = command;
    return validateCommand({ ...rest, label });
  }
  return validateCommand(command);
}
