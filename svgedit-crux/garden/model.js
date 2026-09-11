const object = value => value && typeof value === 'object' && !Array.isArray(value)
export function validateProject (doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'svgedit' || Object.keys(doc).some(k => !['version', 'app', 'project'].includes(k))) throw new Error('Invalid SVG-Edit project.')
  if (doc.project === null) return
  if (!object(doc.project) || Object.keys(doc.project).length > 2002) throw new Error('Invalid drawing components.')
  for (const [key, value] of Object.entries(doc.project)) {
    if (!['svg', 'preferences'].includes(key) && !/^image-[a-f0-9]{64}$/.test(key)) throw new Error('Invalid drawing component name.')
    if (object(value) && Object.keys(value).length === 1 && value.__cruxBinary) {
      const ref = value.__cruxBinary
      if (!object(ref) || !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) || ref.kind !== 'buffer' || ref.type !== 'application/json' || !Number.isSafeInteger(ref.size) || ref.size < 0 || ref.size > 64 * 1024 * 1024 || Object.keys(ref).some(k => !['path', 'kind', 'type', 'size'].includes(k))) throw new Error('Invalid drawing asset.')
    } else if (key === 'preferences') {
      if (!object(value) || JSON.stringify(value).length > 100000 || Object.keys(value).some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('Invalid drawing preferences.')
    } else if (typeof value !== 'string' || value.length > 48 * 1024 * 1024 || (key !== 'svg' && !/^data:image\//.test(value))) throw new Error('Invalid drawing content.')
  }
}

// Native storage is transient; the Garden document owns the drawing and preferences.
export function installMemoryStorage () {
  const values = new Map()
  const storage = {
    get length () { return values.size },
    key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
    clear: () => values.clear()
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  return storage
}
