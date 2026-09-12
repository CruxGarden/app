import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const identity = { type: 'string', minLength: 12, maxLength: 12 };
export const KAN_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_kan',
    description:
      'Inspect active Kan boards and up to 200 cards in one board. Obtain native board, list and card IDs before editing. Kan cards are distinct from Garden Tasks.',
    input_schema: {
      type: 'object',
      properties: { boardPublicId: identity },
      required: [],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'create_kan_card',
    description:
      'Create a card at the end of an existing Kan list. Description is plain text. Saves through Garden after the native operation succeeds.',
    input_schema: {
      type: 'object',
      properties: {
        listPublicId: identity,
        title: { type: 'string', minLength: 1, maxLength: 2000 },
        description: { type: 'string', maxLength: 10000 },
      },
      required: ['listPublicId', 'title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'rename_kan_card',
    description:
      'Change a Kan card title while retaining its identity and native activity history.',
    input_schema: {
      type: 'object',
      properties: {
        cardPublicId: identity,
        title: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['cardPublicId', 'title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'move_kan_card',
    description:
      'Move a Kan card to a list in the same board at a zero-based index. Inspect the board first to choose a valid position.',
    input_schema: {
      type: 'object',
      properties: {
        cardPublicId: identity,
        listPublicId: identity,
        index: { type: 'integer', minimum: 0, maximum: 10000 },
      },
      required: ['cardPublicId', 'listPublicId', 'index'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function kanCommand(name: string, input: Record<string, unknown>) {
  const definitions: Record<string, { op: string; allowed: string[]; required: string[] }> = {
    inspect_kan: { op: 'inspect', allowed: ['boardPublicId'], required: [] },
    create_kan_card: {
      op: 'create-card',
      allowed: ['listPublicId', 'title', 'description'],
      required: ['listPublicId', 'title'],
    },
    rename_kan_card: {
      op: 'update-card',
      allowed: ['cardPublicId', 'title'],
      required: ['cardPublicId', 'title'],
    },
    move_kan_card: {
      op: 'move-card',
      allowed: ['cardPublicId', 'listPublicId', 'index'],
      required: ['cardPublicId', 'listPublicId', 'index'],
    },
  };
  const definition = Object.hasOwn(definitions, name) ? definitions[name] : undefined;
  if (
    !definition ||
    Object.keys(input).some((key) => !definition.allowed.includes(key)) ||
    definition.required.some((key) => !Object.hasOwn(input, key))
  )
    throw new Error('Choose a supported Kan operation and its declared fields.');
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith('PublicId') && (typeof value !== 'string' || !/^[\w-]{12}$/.test(value)))
      throw new Error('Choose a native Kan identity from inspection.');
    if (key === 'title' && (typeof value !== 'string' || !value.trim() || value.length > 2000))
      throw new Error('Choose a card title up to 2000 characters.');
    if (key === 'description' && (typeof value !== 'string' || value.length > 10000))
      throw new Error('Choose a description up to 10000 characters.');
    if (
      key === 'index' &&
      (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000)
    )
      throw new Error('Choose a valid card index.');
  }
  return { op: definition.op, ...input };
}
