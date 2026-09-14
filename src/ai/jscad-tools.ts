import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
/** JSCAD App Tools: read the model, name it, replace its source, save an export as an output. */
export const JSCAD_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_model',
    description:
      'Read the open model: its name, the JSCAD source (first 4 000 characters; read data/project.json for all of it), the current error if the source does not evaluate, whether it is still processing, and the export formats available for it.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_model_name',
    description: 'Name the model and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_model_source',
    description:
      'Replace the whole model with new JSCAD source (CommonJS: require("@jscad/modeling"), a main() returning geometry, optional getParameterDefinitions(), module.exports = { main }); the app evaluates it and the result reports any error. Saves the model.',
    input_schema: {
      type: 'object',
      properties: { source: { type: 'string', minLength: 1, maxLength: 400000 } },
      required: ['source'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
    timeoutMs: 3 * 60_000,
  },
  {
    name: 'save_model',
    description:
      'Export the model through JSCAD (stl by default, or 3mf, obj, amf, x3d for solids; svg, dxf for 2D shapes) and save it as a named output of this Crux (exports/).',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['stl', '3mf', 'obj', 'amf', 'x3d', 'svg', 'dxf'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
    timeoutMs: 5 * 60_000,
  },
];
export function jscadCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  if (name === 'inspect_model' && !keys.length) return { op: 'inspect' };
  if (name === 'set_model_name') {
    if (!only(['name']) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200)
      throw new Error('Name the model (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_model_source') {
    if (!only(['source']) || typeof input.source !== 'string' || !input.source.trim() || input.source.length > 400000)
      throw new Error('Give the whole JSCAD source (up to 400 000 characters).');
    if (!/\bmain\b/.test(input.source)) throw new Error('JSCAD source needs a main function.');
    return { op: 'set-source', source: input.source };
  }
  if (name === 'save_model') {
    if (
      !only(['format', 'name']) ||
      (input.format !== undefined && !['stl', '3mf', 'obj', 'amf', 'x3d', 'svg', 'dxf'].includes(input.format as string)) ||
      (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120))
    )
      throw new Error('Choose stl, 3mf, obj, amf, x3d, svg or dxf and an output name up to 120 characters.');
    return { op: 'save-model', format: input.format ?? 'stl', ...(typeof input.name === 'string' ? { label: input.name.trim() } : {}) };
  }
  throw new Error(`Unknown model tool ${name}.`);
}
