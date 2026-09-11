export function validatePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.length > 1000 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((p) => !p || p === '.' || p === '..') ||
    /[\x00-\x1f]/.test(path)
  )
    throw new Error('Choose a notebook or file in this Crux.');
  return path;
}
export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'jupyterlite')
    throw new Error('Choose a JupyterLite project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (
    !p ||
    !Array.isArray(p.files) ||
    p.files.length > 10000 ||
    !Array.isArray(p.open) ||
    p.open.length > 100
  )
    throw new Error('Choose a notebook project with at most 10,000 files.');
  const paths = new Set();
  for (const f of p.files) {
    validatePath(f.path);
    if (paths.has(f.path)) throw new Error('Notebook files must have unique paths.');
    paths.add(f.path);
    if (!['notebook', 'file', 'directory'].includes(f.type))
      throw new Error('Choose a native notebook, file or folder.');
    if (f.type === 'directory') {
      if (f.content !== null) throw new Error('Folders cannot contain file bytes.');
      continue;
    }
    if (!['json', 'text', 'base64'].includes(f.format) || typeof f.mimetype !== 'string')
      throw new Error('Preserve the native file format.');
    const ref = f.content?.__cruxBinary;
    if (
      !ref ||
      ref.kind !== 'buffer' ||
      ref.type !== 'application/json' ||
      !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
      !Number.isInteger(ref.size) ||
      ref.size <= 0 ||
      ref.size > 128000000
    )
      throw new Error('Import the notebook or dataset bytes before saving.');
  }
  for (const path of p.open) {
    validatePath(path);
    if (!paths.has(path)) throw new Error('Open a saved document from this Crux.');
  }
  if (p.active !== null && p.active !== undefined && !p.open.includes(p.active))
    throw new Error('Select an open notebook.');
}
