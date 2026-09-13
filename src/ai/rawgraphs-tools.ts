import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const RAWGRAPHS_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_rawgraphs',
    description:
      'Read the open RAWGraphs chart, column names, row count, mapping and visual options.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_rawgraphs_size',
    description: 'Set the native chart width and height in pixels and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: {
        width: { type: 'integer', minimum: 100, maximum: 4000 },
        height: { type: 'integer', minimum: 100, maximum: 4000 },
      },
      required: ['width', 'height'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'save_rawgraphs_figure',
    description:
      'Render the chart to a PNG and save it as a named output of this Crux, so other members of its Cruxspaces can use it. Map the data to a chart first.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
  },
];
export function rawgraphsCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_rawgraphs' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'save_rawgraphs_figure') {
    if (
      Object.keys(input).length !== 1 ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 120
    )
      throw new Error('Name the figure output (up to 120 characters).');
    return { op: 'save-figure', label: input.name.trim() };
  }
  if (
    name !== 'set_rawgraphs_size' ||
    Object.keys(input).length !== 2 ||
    ![input.width, input.height].every(
      (v) => Number.isInteger(v) && (v as number) >= 100 && (v as number) <= 4000,
    )
  )
    throw new Error('Choose figure dimensions between 100 and 4,000 pixels.');
  return { op: 'size', width: input.width, height: input.height };
}
