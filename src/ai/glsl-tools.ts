import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const GLSL_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_shader',
    description:
      'Read the open shader: its name, source length and line count, the uniforms it declares, the canvas size and whether it compiles. Read the source itself from data/project.json with read_file.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_shader_name',
    description: 'Name the shader and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_shader_source',
    description:
      'Replace the whole fragment shader (GLSL ES with a main(); u_resolution, u_time and u_mouse are available); the canvas recompiles and the shader is saved.',
    input_schema: {
      type: 'object',
      properties: { source: { type: 'string', minLength: 1, maxLength: 200000 } },
      required: ['source'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'save_shader_frame',
    description:
      'Save the shader canvas as it looks now as a named PNG output of this Crux (exports/).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
  },
];
export function glslCommand(name: string, input: Record<string, unknown>) {
  const only = (keys: string[]) =>
    Object.keys(input).every((k) => keys.includes(k)) && keys.every((k) => k in input);
  if (name === 'inspect_shader' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'set_shader_name') {
    if (
      !only(['name']) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 200
    )
      throw new Error('Name the shader (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_shader_source') {
    if (
      !only(['source']) ||
      typeof input.source !== 'string' ||
      !input.source.trim() ||
      input.source.length > 200000
    )
      throw new Error('Give the whole fragment shader (up to 200 000 characters).');
    if (!/void\s+main\s*\(/.test(input.source))
      throw new Error('A fragment shader needs a main() function.');
    return { op: 'set-source', source: input.source };
  }
  if (name === 'save_shader_frame') {
    if (
      !only(['name']) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 120
    )
      throw new Error('Name the output (up to 120 characters).');
    return { op: 'save-frame', label: input.name.trim() };
  }
  throw new Error(`Unknown shader tool ${name}.`);
}
