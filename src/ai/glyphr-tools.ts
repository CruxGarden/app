import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
/** Glyphr Studio Font App Tools: read the font, name it, draw a glyph from SVG, save a built font as an output. */
export const GLYPHR_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_font',
    description:
      'Read the open font: name, family, style, units per em, ascent/descent, how many glyphs exist and how many are drawn (with their characters), ligatures, components, preferred export format.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_font_name',
    description: 'Name the font (project name and font family) and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_glyph_svg',
    description:
      'Draw one character’s glyph from SVG outlines (paths, polygons, rects, circles inside an <svg>; y grows downward as in SVG, the outlines are flipped and scaled to the font’s em). Replaces what the glyph had unless replace is false. Saves the font.',
    input_schema: {
      type: 'object',
      properties: {
        char: { type: 'string', minLength: 1, maxLength: 2 },
        svg: { type: 'string', minLength: 1, maxLength: 500000 },
        replace: { type: 'boolean' },
      },
      required: ['char', 'svg'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'save_font',
    description:
      'Build the font with Glyphr Studio and save it as a named output of this Crux (exports/): otf (default), ttf, woff or woff2. At least one glyph must be drawn.',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['otf', 'ttf', 'woff', 'woff2'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
    timeoutMs: 5 * 60_000,
  },
];
export function glyphrCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  if (name === 'inspect_font' && !keys.length) return { op: 'inspect' };
  if (name === 'set_font_name') {
    if (
      !only(['name']) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 200
    )
      throw new Error('Name the font (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_glyph_svg') {
    if (
      !only(['char', 'svg', 'replace']) ||
      typeof input.char !== 'string' ||
      [...input.char].length !== 1 ||
      typeof input.svg !== 'string' ||
      !input.svg.trim() ||
      input.svg.length > 500000 ||
      (input.replace !== undefined && typeof input.replace !== 'boolean')
    )
      throw new Error('Give one character and its SVG outlines (up to 500 000 characters).');
    if (!/<svg[\s>]/i.test(input.svg)) throw new Error('The SVG needs an <svg> root element.');
    return { op: 'set-glyph', char: input.char, svg: input.svg, replace: input.replace !== false };
  }
  if (name === 'save_font') {
    if (
      !only(['format', 'name']) ||
      (input.format !== undefined &&
        !['otf', 'ttf', 'woff', 'woff2'].includes(input.format as string)) ||
      (input.name !== undefined &&
        (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120))
    )
      throw new Error('Choose otf, ttf, woff or woff2 and an output name up to 120 characters.');
    return {
      op: 'save-font',
      ...(input.format ? { format: input.format } : {}),
      ...(typeof input.name === 'string' ? { label: input.name.trim() } : {}),
    };
  }
  throw new Error(`Unknown font tool ${name}.`);
}
