import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const FIELD_TYPES = ['textfield', 'textarea', 'number', 'checkbox', 'checklist', 'radio', 'select', 'datetime', 'taglist', 'text', 'separator'];
export const FORMJS_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_form',
    description: 'Read the open form: its name, its fields (key, type, label, required) and the field types the builder offers.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_form_name',
    description: 'Name the form (the title visitors see) and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_form_field',
    description:
      'Append a field to the form and save it: type (textfield, textarea, number, checkbox, checklist, radio, select, datetime, taglist, text, separator), label, optional key (derived from the label when omitted), options for choice fields, required.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: FIELD_TYPES },
        label: { type: 'string', maxLength: 200 },
        key: { type: 'string', minLength: 1, maxLength: 60, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' },
        options: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 120 }, maxItems: 50 },
        required: { type: 'boolean' },
      },
      required: ['type'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'remove_form_field',
    description: 'Remove a field by its key and save the form.',
    input_schema: {
      type: 'object',
      properties: { key: { type: 'string', minLength: 1, maxLength: 120 } },
      required: ['key'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function formjsCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_form' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'set_form_name') {
    if (Object.keys(input).length !== 1 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200)
      throw new Error('Name the form (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'add_form_field') {
    if (typeof input.type !== 'string' || !FIELD_TYPES.includes(input.type))
      throw new Error(`Choose a field type: ${FIELD_TYPES.join(', ')}.`);
    const keys = Object.keys(input);
    if (keys.some((k) => !['type', 'label', 'key', 'options', 'required'].includes(k)))
      throw new Error('A field has a type, label, key, options and required only.');
    if (input.label !== undefined && (typeof input.label !== 'string' || input.label.length > 200))
      throw new Error('Use a field label up to 200 characters.');
    if (input.key !== undefined && (typeof input.key !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input.key) || input.key.length > 60))
      throw new Error('A field key is a short identifier (letters, digits, underscores).');
    if (input.options !== undefined && (!Array.isArray(input.options) || input.options.length > 50 || input.options.some((o) => typeof o !== 'string' || !o.trim())))
      throw new Error('Options are up to 50 short texts.');
    if (input.required !== undefined && typeof input.required !== 'boolean') throw new Error('required is true or false.');
    return { op: 'add-field', ...input };
  }
  if (name === 'remove_form_field') {
    if (Object.keys(input).length !== 1 || typeof input.key !== 'string' || !input.key.trim())
      throw new Error('Name the field key to remove.');
    return { op: 'remove-field', key: input.key };
  }
  throw new Error(`Unknown form tool ${name}.`);
}
