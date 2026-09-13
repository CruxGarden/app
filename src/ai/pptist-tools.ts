import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const PPTIST_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_pptist',
    description:
      'Inspect the open PPTist presentation: title, each slide with its id, element count and text, the current slide, size and theme colours.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_pptist_title',
    description: 'Set the presentation title (up to 200 characters) and save.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_pptist_slide',
    description: 'Append a slide, with an optional text block (up to 2000 characters), and save. Never starts the presentation.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 1, maxLength: 2000 } },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function pptistCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (name === 'inspect_pptist' && !keys.length) return { op: 'inspect' };
  if (name === 'set_pptist_title') {
    const title = input.title;
    if (keys.length !== 1 || typeof title !== 'string' || !title.trim() || title.length > 200)
      throw new Error('Use a presentation title up to 200 characters.');
    return { op: 'set-title', title: title.trim() };
  }
  if (name === 'add_pptist_slide') {
    const text = input.text;
    if (keys.some((k) => k !== 'text') || (text !== undefined && (typeof text !== 'string' || !text.trim() || text.length > 2000)))
      throw new Error('Use slide text up to 2000 characters, or none.');
    return { op: 'add-slide', ...(typeof text === 'string' ? { text: text.trim() } : {}) };
  }
  throw new Error('Choose a supported PPTist operation.');
}
