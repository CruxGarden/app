import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';

/**
 * What every embedded app's tools share: the no-argument schema, the shape
 * check the host runs against a tool's `input_schema` before the app sees the
 * call, and the two argument helpers the commands lean on. The commands keep
 * only the checks a schema cannot say.
 */
export type InputSchema = AppToolDefinition['input_schema'];

export const NO_INPUT: InputSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};

type PropertySchema = {
  type?: string | string[];
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: PropertySchema;
  maxItems?: number;
};

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return !!value && typeof value === 'object' && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function checkValue(key: string, schema: PropertySchema, value: unknown): string | null {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some((t) => typeMatches(t, value)))
    return `${key} must be ${types.join(' or ')}.`;
  if (schema.enum && !schema.enum.includes(value))
    return `${key} must be one of ${schema.enum.map(String).join(', ')}.`;
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      return `${key} must be at least ${schema.minLength} characters.`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      return `${key} must be at most ${schema.maxLength} characters.`;
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      return `${key} does not match ${schema.pattern}.`;
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      return `${key} must be at least ${schema.minimum}.`;
    if (schema.maximum !== undefined && value > schema.maximum)
      return `${key} must be at most ${schema.maximum}.`;
  }
  if (Array.isArray(value) && schema.maxItems !== undefined && value.length > schema.maxItems)
    return `${key} takes up to ${schema.maxItems} items.`;
  return null;
}

/**
 * The input against the tool's declared schema: required keys present, no
 * others when the schema closes them, each value of the declared type and
 * within its bounds. Returns the first problem, or null.
 */
export function checkAppToolInput(
  tool: Pick<AppToolDefinition, 'name' | 'input_schema'>,
  input: Record<string, unknown>,
): string | null {
  const schema = tool.input_schema;
  const keys = Object.keys(input);
  if (schema.additionalProperties === false) {
    const known = new Set(Object.keys(schema.properties));
    if (!known.size && keys.length) return `${tool.name} takes no input.`;
    const extra = keys.find((k) => !known.has(k));
    if (extra) return `${tool.name} does not take ${extra}.`;
  }
  for (const key of schema.required) if (!(key in input)) return `${key} is required.`;
  for (const key of keys) {
    const property = schema.properties[key] as PropertySchema | undefined;
    if (!property || input[key] === undefined) continue;
    const problem = checkValue(key, property, input[key]);
    if (problem) return problem;
  }
  return null;
}

/** Only these keys are present (and, when `required`, all of those are). */
export function onlyKeys(
  input: Record<string, unknown>,
  allowed: string[],
  required: string[] = [],
): boolean {
  const keys = Object.keys(input);
  return keys.every((k) => allowed.includes(k)) && required.every((k) => k in input);
}

/** Exactly these keys, no more, no fewer. */
export function exactKeys(input: Record<string, unknown>, keys: string[]): boolean {
  return onlyKeys(input, keys, keys);
}

/** A trimmed name up to `max` characters, or the tool's own error. */
export function requireName(value: unknown, max: number, what: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`Name the ${what} (up to ${max} characters).`);
  return value.trim();
}
