const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const assetKey = (key) => /^asset-[a-f0-9]{64}$/.test(key);
const preferenceKey = (key) =>
  /^(settings|settings_profiles|theme|colors|camera_presets|display_presets|keybindings|interface_data|panel_customization|canvas_scenes|preview_scenes|StateMemory\.(advanced_outliner_toggles|viewport_background_color|color_palettes|color_picker_tab|color_picker_rgb|color_palette_locked|brush_presets|animation_presets|start_screen_list_type|skin_poses)|brush_presets|palette|color_history)$/.test(
    key,
  );
export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'blockbench' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw new Error('Invalid Blockbench project.');
  if (doc.project === null) return;
  if (!object(doc.project) || Object.keys(doc.project).length > 4002)
    throw new Error('Invalid model components.');
  for (const [key, value] of Object.entries(doc.project)) {
    if (
      !['index', 'preferences'].includes(key) &&
      !assetKey(key) &&
      !(key.startsWith('model-') && id(key.slice(6)))
    )
      throw new Error('Invalid model component name.');
    if (object(value) && Object.keys(value).length === 1 && value.__cruxBinary) {
      const ref = value.__cruxBinary;
      if (
        !object(ref) ||
        !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
        ref.kind !== 'buffer' ||
        ref.type !== 'application/json' ||
        !Number.isSafeInteger(ref.size) ||
        ref.size < 0 ||
        ref.size > 64 * 1024 * 1024 ||
        Object.keys(ref).some((k) => !['path', 'kind', 'type', 'size'].includes(k))
      )
        throw new Error('Invalid model asset.');
    } else if (key === 'index') {
      if (
        !object(value) ||
        !Array.isArray(value.models) ||
        !Array.isArray(value.open) ||
        value.models.length > 500 ||
        !value.models.every(id) ||
        new Set(value.models).size !== value.models.length ||
        !value.open.every((v) => value.models.includes(v)) ||
        (value.active !== null && !value.open.includes(value.active))
      )
        throw new Error('Invalid model library.');
    } else if (key === 'preferences') {
      if (
        !object(value) ||
        Object.entries(value).some(([k, v]) => !preferenceKey(k) || typeof v !== 'string') ||
        JSON.stringify(value).length > 2000000
      )
        throw new Error('Invalid model preferences.');
    } else if (assetKey(key)) {
      if (
        typeof value !== 'string' ||
        !/^data:(image|audio)\//.test(value) ||
        value.length > 48 * 1024 * 1024
      )
        throw new Error('Invalid embedded model media.');
    } else if (
      !object(value) ||
      !object(value.meta) ||
      JSON.stringify(value).length > 48 * 1024 * 1024
    )
      throw new Error('Invalid native model.');
  }
}
export async function packModels(models, index, preferences) {
  const project = { index, preferences };
  const visit = async (value) => {
    if (typeof value === 'string' && /^data:(image|audio)\//.test(value)) {
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
      ]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
      project['asset-' + hash] = value;
      return { __gardenMedia: hash };
    }
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (object(value))
      return Object.fromEntries(
        await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await visit(v)])),
      );
    return value;
  };
  for (const [key, model] of models) project['model-' + key] = await visit(model);
  validateProject({ version: 1, app: 'blockbench', project });
  return project;
}
export function unpackModel(model, project) {
  const visit = (value) => {
    if (object(value) && Object.keys(value).length === 1 && value.__gardenMedia) {
      const asset = project['asset-' + value.__gardenMedia];
      if (typeof asset !== 'string')
        throw new Error('An embedded model image or audio file is missing.');
      return asset;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (object(value))
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    return value;
  };
  if (!object(model)) throw new Error('A saved model is missing.');
  return visit(model);
}
// Spectrum uses storage.foo assignments as well as the Storage methods.
export function memoryStorage(initial = {}, changed = () => {}) {
  const values = new Map(Object.entries(initial));
  const put = (k, v) => {
    k = String(k);
    v = String(v);
    if (values.get(k) !== v) {
      values.set(k, v);
      changed();
    }
  };
  const remove = (k) => {
    if (values.delete(String(k))) changed();
  };
  const api = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(String(k)) ?? null,
    setItem: put,
    removeItem: remove,
    clear: () => {
      if (values.size) {
        values.clear();
        changed();
      }
    },
  };
  const storage = new Proxy(api, {
    get: (target, k) => (k in target ? Reflect.get(target, k) : values.get(k)),
    set: (_target, k, v) => {
      put(k, v);
      return true;
    },
    deleteProperty: (_target, k) => {
      remove(k);
      return true;
    },
    ownKeys: () => [...values.keys()],
    getOwnPropertyDescriptor: (_target, k) =>
      values.has(k) ? { enumerable: true, configurable: true, value: values.get(k) } : undefined,
  });
  return {
    storage,
    preferences: () => Object.fromEntries([...values].filter(([k]) => preferenceKey(k))),
  };
}
