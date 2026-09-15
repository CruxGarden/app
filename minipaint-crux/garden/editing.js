// Native brush geometry and live-filter data. No editor state is mutated here.
export const FILTER_BOUNDS = {
  brightness: [-100, 100],
  contrast: [-100, 100],
  saturate: [-100, 100],
  'hue-rotate': [0, 360],
  blur: [0, 50],
  grayscale: [0, 100],
  sepia: [0, 100],
  invert: [0, 100],
};
export const EDITING_FIELDS = {
  'add-brush': ['name', 'points', 'size', 'color', 'opacity'],
  'duplicate-layer': ['id', 'name'],
  'edit-filter': ['id', 'action', 'filterId', 'filter', 'value'],
  'crop-canvas': ['x', 'y', 'width', 'height'],
  history: ['direction'],
};

export function validateEditingCommand(value) {
  if (value.op === 'add-brush' || (value.op === 'erase' && value.mode === 'stroke')) {
    if (!Number.isFinite(value.size) || value.size < 1 || value.size > 256)
      throw Error('Use a brush size between 1 and 256 canvas pixels.');
    if (
      !Array.isArray(value.points) ||
      value.points.length < 1 ||
      value.points.length > 1000 ||
      value.points.some(
        (point) =>
          !Array.isArray(point) ||
          point.length !== 2 ||
          point.some((coordinate) => !Number.isFinite(coordinate) || Math.abs(coordinate) > 32768),
      )
    )
      throw Error('Use 1–1000 [x, y] brush points in canvas pixels, between -32768 and 32768.');
  }
  if (
    value.op === 'crop-canvas' &&
    (['x', 'y', 'width', 'height'].some((key) => !Number.isSafeInteger(value[key])) ||
      value.x < 0 ||
      value.y < 0 ||
      value.width * value.height > 32_000_000)
  )
    throw Error('Use an integer crop rectangle inside the canvas, up to 32 megapixels.');
  if (value.op === 'history' && !['undo', 'redo'].includes(value.direction))
    throw Error('Choose undo or redo.');
  if (value.op === 'edit-filter') {
    if (!['add', 'update', 'remove'].includes(value.action))
      throw Error('Choose add, update or remove.');
    if (value.action !== 'add' && (!Number.isSafeInteger(value.filterId) || value.filterId < 1))
      throw Error('Use a filter ID from inspect_minipaint.');
    if (value.action === 'add' && value.filterId !== undefined)
      throw Error('New filters receive their own ID.');
    if (value.action === 'remove') {
      if (value.filter !== undefined || value.value !== undefined)
        throw Error('Removing a filter needs only its layer and filter IDs.');
    } else {
      const bounds = Object.hasOwn(FILTER_BOUNDS, value.filter) && FILTER_BOUNDS[value.filter];
      if (
        !bounds ||
        !Number.isFinite(value.value) ||
        value.value < bounds[0] ||
        value.value > bounds[1]
      )
        throw Error('Choose a supported live filter and a value within its documented range.');
    }
  }
}

export function brushLayer(value) {
  const xs = value.points.map((point) => point[0]);
  const ys = value.points.map((point) => point[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return {
    name: value.name || 'Brush stroke',
    type: 'brush',
    is_vector: true,
    render_function: ['brush', 'render'],
    status: null,
    hide_selection_if_active: true,
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    rotate: null,
    color: value.color ?? '#222222',
    opacity: value.opacity ?? 100,
    params: { size: value.size, pressure: false },
    data: [value.points.map(([px, py]) => [px - x, py - y, value.size])],
  };
}

export function revisedFilters(layer, value) {
  if (!layer.type) throw Error('Choose a nonempty layer.');
  const filters = structuredClone(layer.filters ?? []);
  if (filters.length > 100 || (value.action === 'add' && filters.length >= 100))
    throw Error('Use up to 100 live filters per layer.');
  const index = filters.findIndex((filter) => Number(filter.id) === value.filterId);
  if (value.action !== 'add' && index < 0)
    throw Error('Filter no longer exists. Inspect miniPaint again.');
  if (value.action === 'remove') filters.splice(index, 1);
  else if (value.action === 'update') {
    if (filters[index].name !== value.filter)
      throw Error('Keep the existing filter type when updating; add a new filter to change type.');
    filters[index] = {
      ...filters[index],
      params: { ...filters[index].params, value: value.value },
    };
  } else {
    let id = 1;
    while (filters.some((filter) => Number(filter.id) === id)) id++;
    filters.push({ id, name: value.filter, params: { value: value.value } });
  }
  return filters;
}

export function duplicateLayer(layer, name) {
  const params = {};
  for (const [key, value] of Object.entries(layer)) {
    if (key.startsWith('_') || ['id', 'order', 'link', 'link_canvas'].includes(key)) continue;
    params[key] = structuredClone(value);
  }
  params.name = name || `${layer.name} copy`.slice(0, 200);
  if (layer.type === 'image') params.link = layer.link.cloneNode(true);
  return params;
}

export function cropLayers(config, value) {
  if (value.x + value.width > config.WIDTH || value.y + value.height > config.HEIGHT)
    throw Error('Keep the crop rectangle inside the current canvas.');
  return config.layers.map((layer) => ({
    id: layer.id,
    settings: {
      ...(Number.isFinite(layer.x) ? { x: layer.x - value.x } : {}),
      ...(Number.isFinite(layer.y) ? { y: layer.y - value.y } : {}),
    },
  }));
}
