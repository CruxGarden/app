import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const PLAYCANVAS_EDITOR_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_playcanvas_editor',
    description:
      'Inspect the first 200 native scene entities and assets, including their IDs and types.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_playcanvas_editor_name',
    description: 'Name the native scene project and save in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'rename_playcanvas_editor_entity',
    description: 'Rename an existing scene entity through native undoable editing.',
    input_schema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', minLength: 1, maxLength: 100 },
        name: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['entityId', 'name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function playcanvasEditorCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_playcanvas_editor' && !Object.keys(input).length) return { op: 'inspect' };
  if (typeof input.name === 'string' && input.name.trim() && input.name.length <= 200) {
    if (name === 'set_playcanvas_editor_name' && Object.keys(input).length === 1)
      return { op: 'set-name', name: input.name };
    if (
      name === 'rename_playcanvas_editor_entity' &&
      Object.keys(input).length === 2 &&
      typeof input.entityId === 'string' &&
      input.entityId.length > 0 &&
      input.entityId.length <= 100
    )
      return { op: 'rename-entity', entityId: input.entityId, name: input.name };
  }
  throw new Error('Choose an existing scene entity and a name up to 200 characters.');
}
