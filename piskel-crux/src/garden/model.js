export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'piskel')
    throw new Error('Choose a Piskel project.');
  if (doc.project === null) return;
  const project = doc.project;
  const p = project?.piskel;
  if (
    project?.modelVersion !== 2 ||
    !p ||
    !Number.isInteger(p.width) ||
    p.width < 1 ||
    p.width > 4096 ||
    !Number.isInteger(p.height) ||
    p.height < 1 ||
    p.height > 4096 ||
    !Number.isFinite(p.fps) ||
    p.fps < 0 ||
    p.fps > 1000 ||
    typeof p.name !== 'string' ||
    typeof p.description !== 'string' ||
    !Array.isArray(p.layers) ||
    !p.layers.length ||
    p.layers.length > 100
  )
    throw new Error('Choose valid native Piskel dimensions and layers.');
  let pixels = 0;
  for (const layer of p.layers) {
    if (
      !layer ||
      typeof layer.name !== 'string' ||
      !Number.isFinite(layer.opacity) ||
      layer.opacity < 0 ||
      layer.opacity > 1 ||
      !Number.isInteger(layer.frameCount) ||
      layer.frameCount < 1 ||
      layer.frameCount > 2000 ||
      !Array.isArray(layer.chunks) ||
      !layer.chunks.length
    )
      throw new Error('Invalid Piskel layer.');
    if (layer.frameCount !== p.layers[0].frameCount)
      throw new Error('Piskel layers must have matching animation frames.');
    pixels += p.width * p.height * layer.frameCount;
    const indices = [];
    for (const chunk of layer.chunks) {
      const ref = chunk?.base64PNG?.__cruxBinary;
      if (
        !ref ||
        ref.kind !== 'buffer' ||
        ref.type !== 'image/png' ||
        !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
        !Number.isInteger(ref.size) ||
        ref.size < 1 ||
        ref.size > 128000000 ||
        !Array.isArray(chunk.layout) ||
        !chunk.layout.length
      )
        throw new Error('Import the native Piskel sprite sheet.');
      for (const row of chunk.layout) {
        if (
          !Array.isArray(row) ||
          row.length !== chunk.layout[0].length ||
          row.some((i) => !Number.isInteger(i) || i < 0 || i >= layer.frameCount)
        )
          throw new Error('Invalid Piskel frame layout.');
        indices.push(...row);
      }
    }
    if (indices.length !== layer.frameCount || new Set(indices).size !== layer.frameCount)
      throw new Error('Piskel frames are missing or repeated.');
  }
  if (
    p.hiddenFrames !== undefined &&
    (!Array.isArray(p.hiddenFrames) ||
      p.hiddenFrames.some((i) => !Number.isInteger(i) || i < 0 || i >= p.layers[0].frameCount))
  )
    throw new Error('Invalid hidden animation frames.');
  if (pixels > 64000000) throw new Error('This animation exceeds 64 million layer pixels.');
}
