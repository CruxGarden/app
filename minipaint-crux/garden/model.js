// Garden envelope around miniPaint's native layered document. Raster data is
// stored separately; the native JSON exporter/importer still owns the format.
export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'minipaint')
    throw new Error('Choose a miniPaint project.');
  const p = doc.project;
  if (p === null) return;
  if (
    !p ||
    !p.info ||
    !Array.isArray(p.layers) ||
    !Array.isArray(p.data) ||
    p.layers.length > 500 ||
    p.data.length > 500
  )
    throw new Error('Choose a layered miniPaint document with up to 500 layers.');
  const dimension = (value) => Number.isSafeInteger(value) && value > 0 && value <= 8192;
  if (
    !dimension(p.info.width) ||
    !dimension(p.info.height) ||
    p.info.width * p.info.height > 32_000_000
  )
    throw new Error('Use a canvas up to 8192 pixels per side and 32 megapixels.');
  if (typeof p.info.version !== 'string')
    throw new Error('The miniPaint format version is missing.');
  const ids = new Set();
  for (const layer of p.layers) {
    if (!layer || !Number.isSafeInteger(layer.id) || ids.has(layer.id))
      throw new Error('Layer IDs must be unique.');
    ids.add(layer.id);
    if (
      layer.type === 'image' &&
      (!dimension(layer.width_original) ||
        !dimension(layer.height_original) ||
        layer.width_original * layer.height_original > 32_000_000)
    )
      throw new Error('A raster layer exceeds the supported dimensions.');
  }
  const rasterIds = new Set();
  for (const item of p.data) {
    if (!item || !ids.has(item.id) || rasterIds.has(item.id) || !item.data?.__cruxBinary)
      throw new Error('Every image must have one imported raster reference.');
    rasterIds.add(item.id);
  }
  if (p.layers.some((layer) => layer.type === 'image' && !rasterIds.has(layer.id)))
    throw new Error('An image layer is missing its pixels.');
}
