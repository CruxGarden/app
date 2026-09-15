import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateEventCommand } from '../../gdevelop-crux/garden/events.mjs';
const path = {
  type: 'array',
  maxItems: 16,
  items: { type: 'integer', minimum: 0, maximum: 1000000 },
};
const scene = { type: 'string', minLength: 1, maxLength: 200 };
const expectedState = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const instruction = {
  type: 'object',
  properties: {
    type: { type: 'string', minLength: 1, maxLength: 200 },
    parameters: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 2000 } },
    inverted: { type: 'boolean' },
    awaited: { type: 'boolean' },
  },
  required: ['type', 'parameters'],
  additionalProperties: false,
};
const schema = (
  properties: Record<string, unknown>,
  required: string[],
): AppToolDefinition['input_schema'] => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export const GDEVELOP_EVENT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_gdevelop_events',
    description:
      'Inspect the open scene Events tab. Default section events lists root events; eventPath [] is root or an event path to list its children. For conditions/actions use the containing eventPath; instructionParent optionally lists nested instruction children. Returns bounded native paths, values and fresh expectedState. Paginate before choosing targets; indexes expire after edits/history. Use read_gdevelop_content for exact truncated values and list_gdevelop_capabilities for instruction parameters.',
    input_schema: schema(
      {
        scene,
        eventPath: path,
        section: { type: 'string', enum: ['events', 'conditions', 'actions'] },
        instructionParent: path,
        offset: { type: 'integer', minimum: 0, maximum: 1000000 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      ['scene'],
    ),
    writes: [],
  },
  {
    name: 'edit_gdevelop_event',
    description:
      'Organize native events with fresh expectedState from inspection. insert: parent ([] root), index and kind standard/comment/group, optional text (comment/group only) or disabled. update: eventPath plus text and/or disabled. remove: eventPath (including its children). duplicate/move: eventPath, destination parent and index in the destination BEFORE source removal. Cannot put an event inside itself. Nested event paths supported; unrelated rules preserved. One native event Undo step. Open Events tab and finish native edits/dialogs first.',
    input_schema: schema(
      {
        scene,
        expectedState,
        action: { type: 'string', enum: ['insert', 'update', 'remove', 'duplicate', 'move'] },
        eventPath: path,
        parent: path,
        index: { type: 'integer', minimum: 0, maximum: 1000000 },
        kind: { type: 'string', enum: ['standard', 'comment', 'group'] },
        text: { type: 'string', maxLength: 4000 },
        disabled: { type: 'boolean' },
      },
      ['scene', 'expectedState', 'action'],
    ),
    writes: ['data/project.json'],
  },
  {
    name: 'edit_gdevelop_instruction',
    description:
      'Insert, revise or remove one native condition/action in an existing event with fresh expectedState. eventPath selects event, list is conditions/actions, instructionPath is the nested instruction index path (last index is insertion position for insert). insert/update require instruction with exact native type and ALL ordered parameter strings, including empty code-only slots; discover metadata first. inverted is condition-only; awaited is supported-action-only. Updates preserve child instructions and omitted flags; changing a parent type with children is refused. remove needs no instruction. Native event Undo supported. Metadata checks validate shape/type/arity, not expression meaning or object references; preview the game.',
    input_schema: schema(
      {
        scene,
        expectedState,
        action: { type: 'string', enum: ['insert', 'update', 'remove'] },
        eventPath: path,
        list: { type: 'string', enum: ['conditions', 'actions'] },
        instructionPath: path,
        instruction,
      },
      ['scene', 'expectedState', 'action', 'eventPath', 'list', 'instructionPath'],
    ),
    writes: ['data/project.json'],
  },
  {
    name: 'gdevelop_event_history',
    description:
      'Undo or redo the open scene Events tab through native event history, with fresh expectedState from inspect_gdevelop_events. Includes manual and tool event edits; independent of scene-instance history. Reinspect paths afterward.',
    input_schema: schema(
      { scene, expectedState, direction: { type: 'string', enum: ['undo', 'redo'] } },
      ['scene', 'expectedState', 'direction'],
    ),
    writes: ['data/project.json'],
  },
];
const operations: Record<string, string> = {
  inspect_gdevelop_events: 'inspect-events',
  edit_gdevelop_event: 'edit-event',
  edit_gdevelop_instruction: 'edit-instruction',
  gdevelop_event_history: 'event-history',
};
export function gdevelopEventCommand(name: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations, name)) return null;
  if (Object.hasOwn(input, 'op') || Object.hasOwn(input, 'path'))
    throw new Error('Use only listed event tool arguments.');
  const { eventPath, ...rest } = input;
  const c = {
    op: operations[name],
    ...rest,
    ...(eventPath === undefined ? {} : { path: eventPath }),
  };
  validateEventCommand(c);
  return c;
}
