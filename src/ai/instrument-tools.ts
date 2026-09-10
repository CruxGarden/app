import type { ToolDefinition } from './tools';
type InstrumentCommand =
  | { op: 'inspect' }
  | { op: 'controls'; values: Record<string, number> }
  | { op: 'preset'; presetId: string };

export const INSTRUMENT_TOOLS: ToolDefinition[] = [
  {
    name: 'inspect_instrument',
    description:
      'Inspect the open Cardinal instrument: control IDs, normalized values, missing mappings, available presets, playback and save state. Read this before changing controls or selecting a preset. Requires the current instrument open in Workshop.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'set_instrument_controls',
    description:
      'Set one or more controls on the open Cardinal instrument, using IDs from inspect_instrument and values from 0 to 1. Updates the real engine and saves through the same conflict checks and Growth as manual editing. Does not start sound. Success confirms the save; on failure inspect before retrying because a live draft may remain.',
    input_schema: {
      type: 'object',
      properties: {
        values: {
          type: 'object',
          minProperties: 1,
          maxProperties: 16,
          additionalProperties: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      required: ['values'],
      additionalProperties: false,
    },
  },
  {
    name: 'select_instrument_preset',
    description:
      'Load an existing preset into the open Cardinal instrument and save it with Growth. Use a presetId from inspect_instrument. Preserves pending manual edits by saving them first, refuses conflicts, and does not start sound.',
    input_schema: {
      type: 'object',
      properties: { presetId: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['presetId'],
      additionalProperties: false,
    },
  },
];
export const isInstrumentTool = (name: string) =>
  INSTRUMENT_TOOLS.some((tool) => tool.name === name);
export function instrumentCommand(name: string, input: Record<string, unknown>): InstrumentCommand {
  if (name === 'inspect_instrument' && Object.keys(input).length === 0) return { op: 'inspect' };
  if (
    name === 'select_instrument_preset' &&
    Object.keys(input).length === 1 &&
    typeof input.presetId === 'string' &&
    input.presetId.trim() &&
    input.presetId.length <= 100
  )
    return { op: 'preset', presetId: input.presetId };
  const values = input.values;
  if (
    name === 'set_instrument_controls' &&
    Object.keys(input).length === 1 &&
    values &&
    typeof values === 'object' &&
    !Array.isArray(values)
  ) {
    const entries = Object.entries(values);
    if (
      entries.length > 0 &&
      entries.length <= 16 &&
      entries.every(
        ([key, value]) =>
          key.length > 0 &&
          key.length <= 100 &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 1,
      )
    )
      return { op: 'controls', values: values as Record<string, number> };
  }
  throw new Error(
    'Use inspect_instrument, a valid presetId, or a nonempty values object with control values between 0 and 1.',
  );
}
