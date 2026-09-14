/** The same bounded command contract runs in the host and native model frame. */
const fields = {
  inspect: ['offset', 'limit'],
  'create-model': ['name'],
  'set-name': ['name'],
  'rename-element': ['elementId', 'name'],
  'add-cube': ['name', 'from', 'to', 'origin', 'rotation', 'parentId'],
  'update-cube': ['elementId', 'from', 'to', 'origin', 'rotation'],
  'add-group': ['name', 'origin', 'parentId'],
  'move-element': ['elementId', 'parentId'],
  'delete-element': ['elementId'],
  'save-model': ['label'],
  'save-gltf': ['label'],
};
export function validateCommand(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Object.hasOwn(fields, value.op) ||
    Object.keys(value).some((k) => k !== 'op' && !fields[value.op].includes(k))
  )
    throw new Error('Choose a supported model operation and its documented fields.');
  const v = { ...value };
  if (v.op === 'inspect') {
    if (
      (v.offset !== undefined &&
        (!Number.isInteger(v.offset) || v.offset < 0 || v.offset > 100000)) ||
      (v.limit !== undefined && (!Number.isInteger(v.limit) || v.limit < 1 || v.limit > 50))
    )
      throw new Error('Inspect up to 50 model elements per page with a nonnegative offset.');
  }
  if (['create-model', 'set-name', 'rename-element', 'add-cube', 'add-group'].includes(v.op)) {
    if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 200)
      throw new Error('Name the model or part using up to 200 characters.');
    v.name = v.name.trim();
  }
  if (
    ['rename-element', 'update-cube', 'move-element', 'delete-element'].includes(v.op) &&
    (typeof v.elementId !== 'string' || !v.elementId.length || v.elementId.length > 100)
  )
    throw new Error('Use an elementId from inspection of the active model.');
  if (
    (v.parentId !== undefined &&
      (typeof v.parentId !== 'string' || !v.parentId.length || v.parentId.length > 100)) ||
    (v.op === 'move-element' && v.parentId === undefined)
  )
    throw new Error('Use a group ID from inspection, or root for the top level.');
  for (const key of ['from', 'to', 'origin', 'rotation'])
    if (
      v[key] !== undefined &&
      (!Array.isArray(v[key]) ||
        v[key].length !== 3 ||
        v[key].some((n) => !Number.isFinite(n) || Math.abs(n) > (key === 'rotation' ? 360 : 4096)))
    )
      throw new Error(
        'Use three finite coordinates within ±4096, or rotations within ±360 degrees.',
      );
  if (v.op === 'add-cube' && (!v.from || !v.to))
    throw new Error('Provide the cube’s from and to coordinates.');
  if (
    v.op === 'update-cube' &&
    !['from', 'to', 'origin', 'rotation'].some((k) => v[k] !== undefined)
  )
    throw new Error('Provide at least one geometry field to revise.');
  if (v.from && v.to) validateBounds(v.from, v.to);
  if (['save-model', 'save-gltf'].includes(v.op)) {
    if (typeof v.label !== 'string' || !v.label.trim() || v.label.length > 120)
      throw new Error('Name the output using up to 120 characters.');
    v.label = v.label.trim();
  }
  return v;
}
export function validateBounds(from, to) {
  if (from.some((n, i) => n >= to[i]))
    throw new Error('Each cube dimension must have positive size: from must be less than to.');
}
