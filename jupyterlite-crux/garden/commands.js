/** Shared host/frame validation. Commands address the native open notebook. */
export function validateCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Choose a notebook operation.');
  const fields = {
    inspect: ['offset', 'limit', 'cellId', 'sourceOffset'],
    'create-notebook': ['name'],
    'append-cell': ['cellType', 'source'],
    'insert-cell': ['cellType', 'source', 'index'],
    'replace-cell': ['cellId', 'find', 'replace'],
    'move-cell': ['cellId', 'direction'],
    'delete-cell': ['cellId'],
    'run-cell': ['cellId'],
    'save-notebook': ['label'],
    'save-plot': ['cellId', 'outputIndex', 'label'],
  };
  if (
    !Object.hasOwn(fields, value.op) ||
    Object.keys(value).some((k) => k !== 'op' && !fields[value.op].includes(k))
  )
    throw new Error('Choose only supported notebook fields.');
  const integer = (key, min, max, required = false) => {
    if (
      (required || value[key] !== undefined) &&
      (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)
    )
      throw new Error(`${key} must be an integer from ${min} to ${max}.`);
  };
  const text = (key, min, max) => {
    if (typeof value[key] !== 'string' || value[key].length < min || value[key].length > max)
      throw new Error(`${key} must contain ${min}–${max} characters.`);
  };
  if (value.op === 'inspect') {
    integer('offset', 0, 100000);
    integer('limit', 1, 10);
    integer('sourceOffset', 0, 10000000);
    if (value.cellId !== undefined) text('cellId', 1, 128);
    if (value.sourceOffset !== undefined && !value.cellId)
      throw new Error('Choose a cellId to page through its source.');
  }
  if (['replace-cell', 'move-cell', 'delete-cell', 'run-cell', 'save-plot'].includes(value.op))
    text('cellId', 1, 128);
  if (['append-cell', 'insert-cell'].includes(value.op)) {
    if (!['code', 'markdown'].includes(value.cellType)) throw new Error('Choose code or markdown.');
    text('source', 0, 20000);
    if (value.op === 'insert-cell') integer('index', 0, 100000, true);
  }
  if (value.op === 'replace-cell') {
    text('find', 1, 20000);
    text('replace', 0, 20000);
  }
  if (value.op === 'move-cell' && !['up', 'down'].includes(value.direction))
    throw new Error('Choose up or down.');
  if (value.op === 'create-notebook') {
    text('name', 7, 120);
    if (!/^[\w][\w .-]*\.ipynb$/.test(value.name))
      throw new Error('Choose a new notebook filename such as analysis.ipynb, without folders.');
  }
  if (value.op.startsWith('save-')) {
    text('label', 1, 120);
    if (!value.label.trim()) throw new Error('Name the output.');
    if (value.op === 'save-plot') integer('outputIndex', 0, 100000, true);
  }
  return value;
}

export function replaceSource(source, find, replacement) {
  const at = source.indexOf(find);
  if (at < 0 || source.indexOf(find, at + 1) >= 0)
    throw new Error(
      'The phrase must match exactly once in this cell. Inspect again and choose a unique passage.',
    );
  const next = source.slice(0, at) + replacement + source.slice(at + find.length);
  if (next.length > 200000) throw new Error('Keep the revised cell within 200,000 characters.');
  return next;
}

const outputText = (value) => (Array.isArray(value) ? value.join('') : String(value ?? ''));
/** Bounded output metadata; binary and HTML payloads never enter tool context. */
export function summarizeCell(cell, index, sourceOffset = 0, sourceLimit = 1200) {
  const source = cell.getSource();
  const outputs = cell.getOutputs?.() || [];
  return {
    id: cell.getId(),
    index,
    type: cell.cell_type,
    source: source.slice(sourceOffset, sourceOffset + sourceLimit),
    sourceOffset,
    sourceLength: source.length,
    nextSourceOffset:
      sourceOffset + sourceLimit < source.length ? sourceOffset + sourceLimit : null,
    executionCount: cell.execution_count ?? null,
    outputCount: outputs.length,
    outputs: outputs.slice(0, 5).map((o, outputIndex) => ({
      outputIndex,
      type: o.output_type,
      ...(o.output_type === 'error'
        ? { name: String(o.ename).slice(0, 120), message: String(o.evalue).slice(0, 800) }
        : {}),
      ...(o.text !== undefined || o.data?.['text/plain'] !== undefined
        ? { text: outputText(o.text ?? o.data['text/plain']).slice(0, 800) }
        : {}),
      ...(o.data
        ? {
            mimeTypes: Object.keys(o.data).slice(0, 10),
            ...(o.data['image/png'] ? { exportablePng: true } : {}),
          }
        : {}),
    })),
  };
}
