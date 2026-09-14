import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateWorkbookCommand } from '../../tool-cruxes/shared/workbook-commands.js';
const sheetId = { type: 'string', minLength: 1, maxLength: 128 };
const range = {
  type: 'string',
  description: 'A1 range containing at most 100 cells, for example A1:D8.',
};
const name = { type: 'string', minLength: 1, maxLength: 31 };
const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  writes = ['data/project.json'],
): AppToolDefinition => ({
  name,
  description,
  input_schema: { type: 'object', properties, required, additionalProperties: false },
  writes,
});
export const WORKBOOK_TOOLS = [
  tool(
    'add_workbook_sheet',
    'Add a named sheet through the native spreadsheet editor. Returns its ID. Existing sheets and formulas are retained.',
    {
      name,
      rows: { type: 'integer', minimum: 1, maximum: 10000 },
      columns: { type: 'integer', minimum: 1, maximum: 256 },
    },
    ['name'],
  ),
  tool(
    'rename_workbook_sheet',
    'Rename an existing sheet through the editor, updating formula references.',
    { sheetId, name },
    ['sheetId', 'name'],
  ),
  tool(
    'read_workbook_range',
    'Read up to 100 cells, including formulas and calculated values. Long text is truncated and marked. Inspect first for sheet IDs.',
    { sheetId, range },
    ['sheetId', 'range'],
    [],
  ),
  tool(
    'format_workbook_range',
    'Format up to 100 cells using native undoable controls. Only supplied formatting changes; values and formulas stay intact.',
    {
      sheetId,
      range,
      bold: { type: 'boolean' },
      numberFormat: { type: 'string', enum: ['general', 'integer', 'decimal', 'percent', 'usd'] },
      background: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
    },
    ['sheetId', 'range'],
  ),
  tool(
    'save_workbook_csv',
    'Save evaluated values of one sheet as a CSV output. CSV does not retain formulas or formatting; complete Crux export keeps the editable workbook.',
    { sheetId, name: { type: 'string', minLength: 1, maxLength: 120 } },
    ['sheetId', 'name'],
    ['exports/'],
  ),
];
const ops: Record<string, string> = {
  add_workbook_sheet: 'add-sheet',
  rename_workbook_sheet: 'rename-sheet',
  read_workbook_range: 'read-range',
  format_workbook_range: 'format-range',
  save_workbook_csv: 'save-csv',
  set_workbook_cells: 'cells',
};
export function workbookCommand(name: string, input: Record<string, unknown>) {
  if (Object.hasOwn(input, 'op')) throw new Error('Use the documented spreadsheet inputs.');
  const op = ops[name];
  if (!op) throw new Error('Unknown spreadsheet tool.');
  return validateWorkbookCommand({ ...input, op });
}
