import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateObjectCommand } from '../../gdevelop-crux/garden/objects.mjs';
const common = {
  scene: { type: 'string', minLength: 1, maxLength: 200 },
  object: { type: 'string', minLength: 1, maxLength: 100 },
  scope: { type: 'string', enum: ['scene', 'global'] },
};
const expectedState = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const behavior = { type: 'string', minLength: 1, maxLength: 200 };
const required = ['scene', 'object', 'scope'];
const operations: Record<string, string> = {
  inspect_gdevelop_object: 'inspect-object',
  edit_gdevelop_properties: 'edit-properties',
  edit_gdevelop_animation: 'edit-animation',
};
export const GDEVELOP_OBJECT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_gdevelop_object',
    description:
      'Inspect an existing object in the open scene tab. Choose scene/global scope explicitly. Sections: properties (native names, values, types, allowed choices and writable flags), behaviors (names/types), animations (Sprite indexes, frame counts, timing/loop). For behavior settings choose properties and a behavior name. Returns expectedState for guarded edits. Values are bounded native strings; edit with typed JSON. Specialized properties marked non-writable require native UI. Finish active native fields/dialogs first.',
    input_schema: {
      type: 'object',
      properties: {
        ...common,
        behavior,
        section: { type: 'string', enum: ['properties', 'behaviors', 'animations'] },
        offset: { type: 'integer', minimum: 0, maximum: 1000000 },
        limit: { type: 'integer', minimum: 1, maximum: 30 },
      },
      required,
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'edit_gdevelop_properties',
    description:
      'Revise 1–30 existing native object or named behavior properties in order, preserving other settings, variables, instances and media. Inspect writable descriptors first; pass fresh expectedState. Use JSON numbers/booleans, exact choice strings, r;g;b colors, or existing resource/layer/behavior names as appropriate. Native setters validate the entire batch on a clone before editing. Resource creation and specialized editors are separate. These settings do not belong to scene-instance Undo; Growth preserves saved versions.',
    input_schema: {
      type: 'object',
      properties: {
        ...common,
        expectedState,
        behavior,
        updates: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 200 },
              value: {
                anyOf: [
                  { type: 'string', maxLength: 4000 },
                  { type: 'number', minimum: -1e9, maximum: 1e9 },
                  { type: 'boolean' },
                ],
              },
            },
            required: ['name', 'value'],
            additionalProperties: false,
          },
        },
      },
      required: [...required, 'expectedState', 'updates'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'edit_gdevelop_animation',
    description:
      'Change fps and/or looping for an existing native Sprite animation direction; preserve frames, points, collision masks and other directions. Inspect animations first and pass its current expectedState and animation index; direction defaults to 0. No creation, rename or frame replacement. This does not enter scene-instance Undo; Growth preserves saved versions.',
    input_schema: {
      type: 'object',
      properties: {
        ...common,
        expectedState,
        animation: { type: 'integer', minimum: 0 },
        direction: { type: 'integer', minimum: 0 },
        fps: { type: 'number', minimum: 0.1, maximum: 240 },
        loop: { type: 'boolean' },
      },
      required: [...required, 'expectedState', 'animation'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function gdevelopObjectCommand(name: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations, name)) return null;
  if (Object.hasOwn(input, 'op')) throw new Error('Use only listed object tool arguments.');
  const command = { op: operations[name], ...input };
  validateObjectCommand(command);
  return command;
}
