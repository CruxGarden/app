// Standard Canvas blend/composite modes understood by the native renderer.
export const BLEND_MODES = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  'lighter',
  'copy',
  'source-in',
  'source-out',
  'source-atop',
  'destination-over',
  'destination-in',
  'destination-out',
  'destination-atop',
  'xor',
];
export const COMPOSITING_FIELDS = {
  'rasterize-layer': ['id', 'name'],
  'merge-layers': ['mode', 'ids', 'name'],
};
export function validateCompositingCommand(value) {
  if (value.composition !== undefined && !BLEND_MODES.includes(value.composition))
    throw Error('Choose a supported native composition mode.');
  if (value.op !== 'merge-layers') return;
  if (!['selected', 'visible'].includes(value.mode))
    throw Error('Choose selected layers or all visible layers.');
  if (value.mode === 'visible') {
    if (value.ids !== undefined) throw Error('Visible merge does not take layer IDs.');
  } else if (
    !Array.isArray(value.ids) ||
    value.ids.length < 2 ||
    value.ids.length > 500 ||
    value.ids.some((id) => !Number.isSafeInteger(id)) ||
    new Set(value.ids).size !== value.ids.length
  )
    throw Error('Choose 2–500 distinct layer IDs from inspection.');
}
// Back-to-front order. Selected source-over layers are compositable without
// changing the backdrop; backdrop-dependent blends need a complete visible merge.
export function compositionPlan(config, value) {
  if (
    !Number.isSafeInteger(config.WIDTH) ||
    !Number.isSafeInteger(config.HEIGHT) ||
    config.WIDTH < 1 ||
    config.HEIGHT < 1 ||
    config.WIDTH > 8192 ||
    config.HEIGHT > 8192 ||
    config.WIDTH * config.HEIGHT > 32_000_000
  )
    throw Error('Use a canvas up to 8192 per side and 32 megapixels.');
  const sorted = [...config.layers].sort((a, b) => a.order - b.order);
  let layers;
  if (value.op === 'rasterize-layer') {
    const layer = sorted.find((layer) => layer.id === value.id);
    if (!layer || !layer.type) throw Error('Choose an existing nonempty layer to rasterize.');
    layers = [layer];
  } else if (value.mode === 'visible') {
    layers = sorted.filter((layer) => layer.visible !== false && layer.type);
    if (!layers.length) throw Error('There are no visible layers to merge.');
  } else {
    layers = sorted.filter((layer) => value.ids.includes(layer.id));
    if (layers.length !== value.ids.length)
      throw Error('Layer no longer exists. Inspect miniPaint again.');
    if (layers.some((layer) => !layer.type || layer.visible === false))
      throw Error('Selected merge requires visible, nonempty layers.');
    const start = sorted.indexOf(layers[0]);
    const end = sorted.indexOf(layers.at(-1));
    if (end - start + 1 !== layers.length)
      throw Error('Selected layers must be adjacent in the stack, including hidden layers.');
    if (
      layers.some((layer) => layer.composition !== 'source-over') ||
      sorted[end + 1]?.composition === 'source-atop'
    )
      throw Error(
        'These layers depend on a blend backdrop. Use visible merge to preserve the complete picture.',
      );
  }
  return { layers, order: layers.at(-1).order, width: config.WIDTH, height: config.HEIGHT };
}
