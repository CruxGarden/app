import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateCommand } from '../../rawgraphs-crux/src/garden/commands.js';
const hash = {
  type: 'string',
  pattern: '^[a-f0-9]{64}$',
  description: 'dataHash from a fresh inspect_rawgraphs result.',
};
const page = {
  offset: { type: 'integer', minimum: 0, maximum: 100000 },
  limit: { type: 'integer', minimum: 1, maximum: 50 },
};
const dataWrites = ['data/project.json', 'data/assets/'];
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  writes = dataWrites,
): AppToolDefinition {
  return {
    name,
    description,
    input_schema: { type: 'object', properties, required, additionalProperties: false },
    writes,
    timeoutMs: 180000,
  };
}
export const RAWGRAPHS_TOOLS: AppToolDefinition[] = [
  tool(
    'inspect_rawgraphs',
    'Inspect native chart, column types, bounded raw row samples (10 by default, max 50), dataHash, dimension requirements, mappings and visual option controls. Shows whether a chart is rendered. Inspect before edits; native RAWGraphs has no document Undo command, while Garden retains Growth.',
    page,
    [],
    [],
  ),
  tool(
    'list_rawgraphs_charts',
    'List the bundled chart IDs, names and descriptions, 20 by default, at most 50. Use these IDs to select chart families.',
    page,
    [],
    [],
  ),
  tool(
    'set_rawgraphs_data',
    'Load CSV/TSV text through the native dataset importer, up to one million characters, 10,000 rows and 100 named columns. Existing data or draft requires its current dataHash. Preserve chart/options and compatible mappings; clear mappings explicitly before replacing incompatible columns. Stacked data must first be unstacked in the native editor.',
    {
      text: { type: 'string', minLength: 1, maxLength: 1000000 },
      delimiter: { type: 'string', enum: [',', '\t', ';'] },
      expectedDataHash: hash,
    },
    ['text'],
  ),
  tool(
    'update_rawgraphs_cells',
    'Revise 1–100 specific raw cells using zero-based row indices, current column names and dataHash. Retains other cells and chart settings; refuses stale data or type errors. Use the native data table for the same manual edits.',
    {
      expectedDataHash: hash,
      cells: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          properties: {
            row: { type: 'integer', minimum: 0, maximum: 9999 },
            column: { type: 'string', minLength: 1, maxLength: 200 },
            value: { type: ['string', 'number', 'boolean', 'null'] },
          },
          required: ['row', 'column', 'value'],
          additionalProperties: false,
        },
      },
    },
    ['expectedDataHash', 'cells'],
  ),
  tool(
    'set_rawgraphs_column_types',
    'Change specified existing columns to string, number or date using native type coercion and current dataHash. Rejects parse errors or changes that invalidate mapped chart dimensions; preserves other column types.',
    {
      expectedDataHash: hash,
      columns: {
        type: 'object',
        minProperties: 1,
        maxProperties: 30,
        additionalProperties: { type: 'string', enum: ['string', 'number', 'date'] },
      },
    },
    ['expectedDataHash', 'columns'],
  ),
  tool(
    'select_rawgraphs_chart',
    'Select a bundled chart by ID. Matches native chart selection: changing chart resets mappings and visual options to its defaults, preserving the dataset. Selecting the current chart keeps its settings.',
    { chartId: { type: 'string', minLength: 1, maxLength: 150 } },
    ['chartId'],
  ),
  tool(
    'map_rawgraphs_columns',
    'Set only named chart dimensions to ordered arrays of inspected column names. [] clears a dimension. Checks native type and multiplicity requirements and uses native default aggregations. Preserves all unspecified mappings. Rendering may remain incomplete until all required dimensions are mapped.',
    {
      dimensions: {
        type: 'object',
        minProperties: 1,
        maxProperties: 30,
        additionalProperties: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
    ['dimensions'],
  ),
  tool(
    'set_rawgraphs_options',
    'Revise only specified editable visual controls from inspect_rawgraphs: native numbers, booleans, hex colors and listed text choices. Preserves all other options. Complex color scales and repeated style controls remain native manual controls in this iteration.',
    {
      values: {
        type: 'object',
        minProperties: 1,
        maxProperties: 30,
        additionalProperties: { type: ['number', 'boolean', 'string'] },
      },
    },
    ['values'],
  ),
  tool(
    'set_rawgraphs_size',
    'Set native chart width/height, retaining data, mappings and other settings. Each dimension is 100–4,000 pixels.',
    {
      width: { type: 'integer', minimum: 100, maximum: 4000 },
      height: { type: 'integer', minimum: 100, maximum: 4000 },
    },
    ['width', 'height'],
  ),
  tool(
    'save_rawgraphs_figure',
    'Save the actual rendered chart as PNG (default, 2x), SVG or JPEG (2x), or the complete native editable .rawgraphs project. Matches the native Garden output-format control. Image export requires a successfully rendered chart; project export needs loaded data.',
    {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      format: { type: 'string', enum: ['png', 'svg', 'jpeg', 'rawgraphs'] },
    },
    ['name'],
    [...dataWrites, 'exports/'],
  ),
];
const operations: Record<string, string> = {
  inspect_rawgraphs: 'inspect',
  list_rawgraphs_charts: 'charts',
  set_rawgraphs_data: 'load-data',
  update_rawgraphs_cells: 'cells',
  set_rawgraphs_column_types: 'types',
  select_rawgraphs_chart: 'chart',
  map_rawgraphs_columns: 'mapping',
  set_rawgraphs_options: 'options',
  set_rawgraphs_size: 'size',
  save_rawgraphs_figure: 'save-figure',
};
export function rawgraphsCommand(name: string, input: Record<string, unknown>) {
  if (
    !Object.hasOwn(operations, name) ||
    Object.hasOwn(input, 'op') ||
    Object.hasOwn(input, 'label')
  )
    throw Error('Use a supported chart tool and its documented fields.');
  if (name === 'save_rawgraphs_figure') {
    const { name: label, ...rest } = input;
    return validateCommand({ ...rest, op: operations[name], label });
  }
  return validateCommand({ ...input, op: operations[name] });
}
