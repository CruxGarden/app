import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { EFFECTS, PADS, SHAPES } from '../../tool-cruxes/shared/model.js';
const names: Record<string, [string, string, string]> = {
  openmosh: ['inspect_effects', 'set_effects', 'effects'],
  tables: ['inspect_table', 'upsert_table_rows', 'rows'],
  smplr: ['inspect_pattern', 'set_pattern', 'pattern'],
  playcanvas: ['inspect_scene', 'upsert_scene_objects', 'objects'],
};
const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});
export function samplerTools(type: string) {
  const namesForType = names[type];
  if (!namesForType) return null;
  const [inspect, mutate, op] = namesForType;
  const descriptions: Record<string, string> = {
    openmosh:
      'Replace the ordered effect stack (up to eight). Inspect first for available effects and parameter ranges. Original images remain unchanged.',
    tables:
      'Insert rows with new IDs or update fields of existing row IDs. Inspect first for column keys/types. Supply 1–100 rows; preserve IDs. Unspecified fields in an existing row are retained. Does not delete rows.',
    smplr:
      'Set tempo (40–240 integer BPM), volume (0–100), or the full four-track pattern with exactly 16 booleans per track. Does not start sound; changes stop playback.',
    playcanvas:
      'Insert scene objects or update existing object IDs. New objects need id, name, shape, hex color, position/rotation/scale arrays. Existing objects may supply changed fields only. Position and rotation are XYZ (degrees for rotation). Does not delete objects.',
  };
  const schemas: Record<string, ReturnType<typeof objectSchema>> = {
    openmosh: objectSchema(
      {
        effects: {
          type: 'array',
          maxItems: 8,
          items: objectSchema(
            {
              kind: { type: 'string', enum: Object.keys(EFFECTS) },
              values: { type: 'object', additionalProperties: { type: 'number' } },
            },
            ['kind', 'values'],
          ),
        },
        time: { type: 'number', minimum: 0, maximum: 3600 },
      },
      ['effects'],
    ),
    tables: objectSchema(
      {
        rows: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: { type: ['string', 'number'] },
          },
        },
      },
      ['rows'],
    ),
    smplr: objectSchema({
      bpm: { type: 'integer', minimum: 40, maximum: 240 },
      volume: { type: 'number', minimum: 0, maximum: 100 },
      pattern: objectSchema(
        Object.fromEntries(
          PADS.map((p) => [
            p,
            { type: 'array', minItems: 16, maxItems: 16, items: { type: 'boolean' } },
          ]),
        ),
        PADS,
      ),
    }),
    playcanvas: objectSchema(
      {
        objects: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: objectSchema(
            {
              id: { type: 'string' },
              name: { type: 'string' },
              shape: { type: 'string', enum: SHAPES },
              color: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
              ...Object.fromEntries(
                ['position', 'rotation', 'scale'].map((k) => [
                  k,
                  { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
                ]),
              ),
            },
            ['id'],
          ),
        },
      },
      ['objects'],
    ),
  };
  const tools: AppToolDefinition[] = [
    {
      name: inspect,
      description: `Inspect this open ${type} app's project and saved state. Tables return the first 50 rows and total count; use read_file for the complete document. Requires the current app open in Workshop.`,
      input_schema: objectSchema({}),
      writes: [],
    },
    {
      name: mutate,
      description:
        descriptions[type] +
        ' Requires the current app open in Workshop. Success confirms a save with Growth; conflicts preserve a live draft, so inspect before retrying.',
      input_schema: schemas[type]!,
      writes: ['data/project.json'],
    },
  ];
  return {
    tools,
    prepare: (name: string, input: Record<string, unknown>) => {
      if (name === inspect && !Object.keys(input).length)
        return { op: 'inspect', ...(type === 'openmosh' ? { availableEffects: EFFECTS } : {}) };
      const schema = schemas[type]!;
      if (
        name !== mutate ||
        !Object.keys(input).length ||
        Object.keys(input).some((k) => !Object.hasOwn(schema.properties, k)) ||
        schema.required.some((k) => !(k in input))
      )
        throw new Error('Use the documented app command inputs. Inspect the project first.');
      return { op, ...input };
    },
  };
}
