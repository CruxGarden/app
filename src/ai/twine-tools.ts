import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const TWINE_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_twine',
    description:
      'List native stories with their IDs, titles, passage counts, formats and the first 100 passages (text previews up to 2,000 characters).',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_twine_title',
    description: 'Rename an existing native story and save the library in Garden.',
    input_schema: {
      type: 'object',
      properties: {
        storyId: { type: 'string', minLength: 1, maxLength: 100 },
        title: { type: 'string', minLength: 1, maxLength: 300 },
      },
      required: ['storyId', 'title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_twine_passage',
    description:
      'Replace text in one existing passage through Twine. Native links create newly referenced passages. Saves without executing the story.',
    input_schema: {
      type: 'object',
      properties: {
        storyId: { type: 'string', minLength: 1, maxLength: 100 },
        passageId: { type: 'string', minLength: 1, maxLength: 100 },
        text: { type: 'string', maxLength: 100000 },
      },
      required: ['storyId', 'passageId', 'text'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function twineCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_twine' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'set_twine_passage') {
    if (
      Object.keys(input).length !== 3 ||
      typeof input.storyId !== 'string' ||
      !input.storyId ||
      input.storyId.length > 100 ||
      typeof input.passageId !== 'string' ||
      !input.passageId ||
      input.passageId.length > 100 ||
      typeof input.text !== 'string' ||
      input.text.length > 100000
    )
      throw new Error('Choose an existing story and passage, with text up to 100,000 characters.');
    return {
      op: 'set-passage',
      storyId: input.storyId,
      passageId: input.passageId,
      text: input.text,
    };
  }
  if (
    name !== 'set_twine_title' ||
    Object.keys(input).length !== 2 ||
    typeof input.storyId !== 'string' ||
    !input.storyId ||
    input.storyId.length > 100 ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 300
  )
    throw new Error('Choose an existing story and a title up to 300 characters.');
  return { op: 'set-title', storyId: input.storyId, title: input.title };
}
