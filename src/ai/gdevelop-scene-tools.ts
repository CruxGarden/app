import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateSceneCommand } from '../../gdevelop-crux/garden/instances.mjs';
const scene = { type: 'string', minLength: 1, maxLength: 200 };
const expectedState = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const ids = {
  type: 'array',
  maxItems: 50,
  uniqueItems: true,
  items: { type: 'string', minLength: 1, maxLength: 200 },
};
const coordinate = { type: 'number', minimum: -100000, maximum: 100000 };
const dimension = { type: 'number', minimum: 1, maximum: 16384 };
const flag = { type: 'boolean' };
const operations: Record<string, string> = {
  inspect_gdevelop_scene: 'inspect-scene',
  edit_gdevelop_instances: 'edit-instances',
  duplicate_gdevelop_instances: 'duplicate-instances',
  delete_gdevelop_instances: 'delete-instances',
  select_gdevelop_instances: 'select-instances',
  gdevelop_scene_history: 'scene-history',
};
export const GDEVELOP_SCENE_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_gdevelop_scene',
    description:
      'Inspect the currently open native scene tab: stable instance IDs, placement/size/layer/visibility, selection and scene-instance Undo/Redo availability. Returns expectedState for guarded edits; inspect again after any edit or history operation. Finish active property-field editing first. Does not cover event/object history.',
    input_schema: {
      type: 'object',
      properties: {
        scene,
        offset: { type: 'integer', minimum: 0, maximum: 1000000 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['scene'],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'edit_gdevelop_instances',
    description:
      'Revise 1–50 placed instances by stable ID in the open scene tab, preserving all unspecified native data. One native scene-history step. Supply width and height together for an explicit size; naturalSize:true resets native dimensions. Supports position/3D rotation/depth, layer/z-order, 0–255 opacity, flips, visibility and locking. Locked instances require explicit locked:false. Requires fresh expectedState from inspect_gdevelop_scene; stale edits are rejected.',
    input_schema: {
      type: 'object',
      properties: {
        scene,
        expectedState,
        updates: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              id: scene,
              x: coordinate,
              y: coordinate,
              z: coordinate,
              angle: coordinate,
              rotationX: coordinate,
              rotationY: coordinate,
              width: dimension,
              height: dimension,
              depth: dimension,
              naturalSize: flag,
              layer: { type: 'string', maxLength: 200 },
              zOrder: { type: 'integer', minimum: -100000, maximum: 100000 },
              opacity: { type: 'integer', minimum: 0, maximum: 255 },
              flippedX: flag,
              flippedY: flag,
              hidden: flag,
              locked: flag,
            },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      required: ['scene', 'expectedState', 'updates'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'duplicate_gdevelop_instances',
    description:
      'Duplicate 1–50 unlocked placed instances in the open scene tab with new native IDs, preserving variables and other properties. Optional dx/dy offsets default to 16. One native scene-history step; returns new IDs. Requires fresh expectedState.',
    input_schema: {
      type: 'object',
      properties: {
        scene,
        expectedState,
        ids: { ...ids, minItems: 1 },
        dx: coordinate,
        dy: coordinate,
      },
      required: ['scene', 'expectedState', 'ids'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'delete_gdevelop_instances',
    description:
      'Remove 1–50 unlocked placed instances from the open scene tab by stable ID. Preserves object definitions, resources and other instances; one native scene-history step. Requires fresh expectedState.',
    input_schema: {
      type: 'object',
      properties: { scene, expectedState, ids: { ...ids, minItems: 1 } },
      required: ['scene', 'expectedState', 'ids'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'select_gdevelop_instances',
    description:
      'Select up to 50 instances in the open native scene tab for direct inspection/editing; empty IDs clears selection. Does not modify game content. Requires fresh expectedState.',
    input_schema: {
      type: 'object',
      properties: { scene, expectedState, ids },
      required: ['scene', 'expectedState', 'ids'],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'gdevelop_scene_history',
    description:
      'Undo or redo one step in the open scene tab’s native instance history, including manual or tool instance edits. Does not undo object definitions, event rules or other project fields. Inspect first for availability and expectedState; history resets when reopening the editor.',
    input_schema: {
      type: 'object',
      properties: { scene, expectedState, direction: { type: 'string', enum: ['undo', 'redo'] } },
      required: ['scene', 'expectedState', 'direction'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function gdevelopSceneCommand(name: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations, name)) return null;
  if (Object.hasOwn(input, 'op')) throw new Error('Use only the listed tool arguments.');
  const command = { op: operations[name], ...input };
  validateSceneCommand(command);
  return command;
}
