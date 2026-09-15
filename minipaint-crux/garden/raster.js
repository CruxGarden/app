// Bounded raster preparation. The bridge commits pixels through native history.
export const RASTER_FIELDS = {
  selection: ['id', 'action', 'x', 'y', 'width', 'height'],
  erase: ['id', 'mode', 'points', 'size', 'opacity'],
  fill: ['id', 'mode', 'x', 'y', 'color', 'opacity', 'tolerance'],
};

export function validateRasterCommand(value) {
  if (value.op === 'selection') {
    if (!['set', 'clear'].includes(value.action)) throw Error('Choose set or clear selection.');
    const keys = ['x', 'y', 'width', 'height'];
    if (value.action === 'set' && keys.some((key) => !Number.isFinite(value[key])))
      throw Error('Specify a rectangular selection in canvas pixels.');
    if (value.action === 'clear' && keys.some((key) => value[key] !== undefined))
      throw Error('Clearing a selection needs only its layer ID.');
  }
  if (value.op === 'erase') {
    if (!['stroke', 'selection'].includes(value.mode)) throw Error('Choose stroke or selection.');
    if (value.mode === 'selection' && (value.points !== undefined || value.size !== undefined))
      throw Error('Selection erasing uses the inspected native selection, without stroke points.');
  }
  if (value.op === 'fill') {
    if (!['contiguous', 'global', 'selection'].includes(value.mode))
      throw Error('Choose contiguous, global or selection fill.');
    if (value.color === undefined) throw Error('Specify a fill color.');
    if (value.mode !== 'selection' && (!Number.isFinite(value.x) || !Number.isFinite(value.y)))
      throw Error('Specify the seed x/y in canvas pixels.');
    if (
      value.mode === 'selection' &&
      ['x', 'y', 'tolerance'].some((key) => value[key] !== undefined)
    )
      throw Error('Selection fill uses the inspected rectangle without a seed or tolerance.');
    if (
      value.tolerance !== undefined &&
      (!Number.isFinite(value.tolerance) || value.tolerance < 0 || value.tolerance > 100)
    )
      throw Error('Use color tolerance from 0 to 100 percent.');
  }
}

export function rasterGeometry(layer) {
  if (layer.type !== 'image' || layer.is_vector || layer.rotate)
    throw Error(
      'Choose an unrotated raster image layer. Rasterize vectors or reset rotation first.',
    );
  if (
    ['width', 'height', 'width_original', 'height_original'].some(
      (key) => !Number.isFinite(layer[key]) || layer[key] <= 0,
    ) ||
    !Number.isFinite(layer.x) ||
    !Number.isFinite(layer.y) ||
    !Number.isSafeInteger(layer.width_original) ||
    !Number.isSafeInteger(layer.height_original) ||
    layer.width_original > 8192 ||
    layer.height_original > 8192 ||
    layer.width_original * layer.height_original > 32_000_000
  )
    throw Error('Use valid raster dimensions up to 8192 per side and 32 megapixels.');
  return { sx: layer.width_original / layer.width, sy: layer.height_original / layer.height };
}

export function rasterSelection(layer, selection) {
  const { sx, sy } = rasterGeometry(layer);
  if (
    !selection ||
    ['x', 'y', 'width', 'height'].some((key) => !Number.isFinite(selection[key])) ||
    selection.width <= 0 ||
    selection.height <= 0
  )
    throw Error('Select a rectangular region on this layer first.');
  const x = Math.max(0, Math.floor((selection.x - layer.x) * sx));
  const y = Math.max(0, Math.floor((selection.y - layer.y) * sy));
  const right = Math.min(
    layer.width_original,
    Math.ceil((selection.x + selection.width - layer.x) * sx),
  );
  const bottom = Math.min(
    layer.height_original,
    Math.ceil((selection.y + selection.height - layer.y) * sy),
  );
  if (right <= x || bottom <= y) throw Error('The selection does not overlap this image layer.');
  return { x, y, width: right - x, height: bottom - y };
}

export function rasterSeed(layer, value) {
  const { sx, sy } = rasterGeometry(layer);
  const x = Math.floor((value.x - layer.x) * sx),
    y = Math.floor((value.y - layer.y) * sy);
  if (x < 0 || y < 0 || x >= layer.width_original || y >= layer.height_original)
    throw Error('Keep the fill seed inside the image layer.');
  return { x, y };
}

// Straight RGBA comparison against the original seed; source-over color compositing.
// Transparent pixels compare as transparent regardless of their hidden RGB values.
export function fillPixels(
  image,
  seed,
  color,
  opacity = 100,
  tolerance = 0,
  global = false,
  region = null,
) {
  const { data, width, height } = image;
  const rgba = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const alpha = opacity / 100;
  const target = seed
    ? Array.from(data.slice((seed.y * width + seed.x) * 4, (seed.y * width + seed.x) * 4 + 4))
    : null;
  const threshold = (tolerance * 255) / 100;
  const matches = (index) => {
    const offset = index * 4;
    return (
      Math.abs(data[offset + 3] - target[3]) <= threshold &&
      ((data[offset + 3] === 0 && target[3] === 0) ||
        [0, 1, 2].every(
          (channel) => Math.abs(data[offset + channel] - target[channel]) <= threshold,
        ))
    );
  };
  const paint = (index) => {
    const offset = index * 4,
      oldAlpha = data[offset + 3] / 255;
    const nextAlpha = alpha + oldAlpha * (1 - alpha);
    if (!nextAlpha) return;
    for (let channel = 0; channel < 3; channel++)
      data[offset + channel] = Math.round(
        (rgba[channel] * alpha + data[offset + channel] * oldAlpha * (1 - alpha)) / nextAlpha,
      );
    data[offset + 3] = Math.round(nextAlpha * 255);
  };
  if (region) {
    for (let y = region.y; y < region.y + region.height; y++)
      for (let x = region.x; x < region.x + region.width; x++) paint(y * width + x);
  } else if (global) {
    for (let index = 0; index < width * height; index++) if (matches(index)) paint(index);
  } else {
    // Each pixel is queued at most once, bounding memory even for an entire photo.
    const visited = new Uint8Array(width * height);
    const queue = new Uint32Array(width * height);
    let head = 0,
      tail = 0;
    const enqueue = (index) => {
      if (visited[index]) return;
      visited[index] = 1;
      if (matches(index)) queue[tail++] = index;
    };
    enqueue(seed.y * width + seed.x);
    while (head < tail) {
      const index = queue[head++],
        x = index % width;
      paint(index);
      if (x > 0) enqueue(index - 1);
      if (x + 1 < width) enqueue(index + 1);
      if (index >= width) enqueue(index - width);
      if (index + width < width * height) enqueue(index + width);
    }
  }
  return image;
}

export function eraseStroke(ctx, layer, value) {
  const { sx, sy } = rasterGeometry(layer);
  ctx.save();
  ctx.scale(sx, sy);
  ctx.translate(-layer.x, -layer.y);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = (value.opacity ?? 100) / 100;
  ctx.lineWidth = value.size;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  if (value.points.length === 1) {
    ctx.arc(value.points[0][0], value.points[0][1], value.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(...value.points[0]);
    for (const point of value.points.slice(1)) ctx.lineTo(...point);
    ctx.stroke();
  }
  ctx.restore();
}
