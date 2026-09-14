import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateCommand } from '../../jupyterlite-crux/garden/commands.js';
const id = { type: 'string', minLength: 1, maxLength: 128 };
const cell = {
  cellType: { type: 'string', enum: ['code', 'markdown'] },
  source: { type: 'string', maxLength: 20000 },
};
const label = { type: 'string', minLength: 1, maxLength: 120 };
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  writes: string[],
): AppToolDefinition {
  return {
    name,
    description,
    input_schema: { type: 'object', properties, required, additionalProperties: false },
    writes,
    timeoutMs: 180000,
  };
}
const project = ['data/project.json', 'data/assets/'];
export const JUPYTERLITE_TOOLS: AppToolDefinition[] = [
  tool(
    'inspect_jupyterlite',
    'Read the active native notebook: stable cell IDs, sources, execution counts, bounded text/errors and output MIME types. Default 3 cells; page with offset/limit. For a long cell use cellId and sourceOffset (6,000 characters per page). Outputs show at most the first 5 per cell; binary/HTML payloads are omitted. Saved outputs may be stale after source edits; rerun to verify.',
    {
      offset: { type: 'integer', minimum: 0, maximum: 100000 },
      limit: { type: 'integer', minimum: 1, maximum: 10 },
      cellId: id,
      sourceOffset: { type: 'integer', minimum: 0, maximum: 10000000 },
    },
    [],
    [],
  ),
  tool(
    'create_jupyterlite_notebook',
    'Create and open a new native Python (Pyodide) notebook in the notebook file browser. Refuses an existing name; starts with one empty code cell. Notebook creation is saved, but is not a cell Undo operation.',
    { name: label },
    ['name'],
    project,
  ),
  tool(
    'append_jupyterlite_cell',
    'Append a native code or Markdown cell to the active notebook. Does not execute code. Preserves other cells and native Undo, then confirms save.',
    cell,
    ['cellType', 'source'],
    project,
  ),
  tool(
    'insert_jupyterlite_cell',
    'Insert a native code or Markdown cell at a zero-based position from inspection. Does not execute code; native Undo and confirmed save.',
    { ...cell, index: { type: 'integer', minimum: 0, maximum: 100000 } },
    ['cellType', 'source', 'index'],
    project,
  ),
  tool(
    'replace_jupyterlite_cell_text',
    'Replace one unique exact passage in a native cell by stable ID from inspection. Preserves other source, metadata, attachments and manual notes; rejects absent or ambiguous text. Native text Undo. Existing code outputs remain and may be stale: run the cell again to verify.',
    {
      cellId: id,
      find: { type: 'string', minLength: 1, maxLength: 20000 },
      replace: { type: 'string', maxLength: 20000 },
    },
    ['cellId', 'find', 'replace'],
    project,
  ),
  tool(
    'move_jupyterlite_cell',
    'Move one native cell up or down, preserving its source and outputs. Uses native cell Undo and confirmed save. Inspect again after moving.',
    { cellId: id, direction: { type: 'string', enum: ['up', 'down'] } },
    ['cellId', 'direction'],
    project,
  ),
  tool(
    'delete_jupyterlite_cell',
    'Delete a native cell by stable ID, retaining at least one cell. Native cell Undo restores it; confirms save.',
    { cellId: id },
    ['cellId'],
    project,
  ),
  tool(
    'run_jupyterlite_cell',
    'Run only the specified native cell (or render Markdown), wait for outputs and save. Returns executionSucceeded and bounded native errors/text; inspect outputs before proceeding. Python can read/write files inside the notebook filesystem. Execution effects are not undoable; kernel memory is transient and dependencies must be rerun after reopening. A 60-second timeout attempts interruption; inspect before retrying an uncertain result.',
    { cellId: id },
    ['cellId'],
    project,
  ),
  tool(
    'save_jupyterlite_notebook',
    'Save the active native notebook including sources, metadata and current outputs as a reusable .ipynb output. Does not execute cells; results can be stale. Native File > Download is the manual equivalent.',
    { name: label },
    ['name'],
    [...project, 'exports/'],
  ),
  tool(
    'save_jupyterlite_plot',
    'Save a native image/png result from a code cell as a PNG output. Use cellId and zero-based outputIndex from inspection. Does not rerun the cell. The native plot image save action is the manual equivalent.',
    { cellId: id, outputIndex: { type: 'integer', minimum: 0, maximum: 100000 }, name: label },
    ['cellId', 'outputIndex', 'name'],
    [...project, 'exports/'],
  ),
];
const operations: Record<string, string> = {
  inspect_jupyterlite: 'inspect',
  create_jupyterlite_notebook: 'create-notebook',
  append_jupyterlite_cell: 'append-cell',
  insert_jupyterlite_cell: 'insert-cell',
  replace_jupyterlite_cell_text: 'replace-cell',
  move_jupyterlite_cell: 'move-cell',
  delete_jupyterlite_cell: 'delete-cell',
  run_jupyterlite_cell: 'run-cell',
  save_jupyterlite_notebook: 'save-notebook',
  save_jupyterlite_plot: 'save-plot',
};
export function jupyterliteCommand(name: string, input: Record<string, unknown>) {
  if (
    !Object.hasOwn(operations, name) ||
    Object.hasOwn(input, 'op') ||
    Object.hasOwn(input, 'label')
  )
    throw new Error('Choose a supported notebook operation.');
  const command: Record<string, unknown> = { ...input, op: operations[name] };
  if (name.startsWith('save_jupyterlite_')) {
    const { name: label, ...rest } = command;
    return validateCommand({ ...rest, label });
  }
  return validateCommand(command);
}
