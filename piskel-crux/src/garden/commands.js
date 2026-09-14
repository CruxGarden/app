/** Shared host/frame validation. Coordinates are zero-based native pixels. */
const fields = {
  inspect: ['layerIndex', 'frameIndex', 'x', 'y', 'width', 'height', 'offset'],
  paint: ['layerIndex', 'frameIndex', 'expectedHash', 'pixels'],
  'insert-frame': ['index'],
  'duplicate-frame': ['frameId'],
  'move-frame': ['frameId', 'index'],
  'delete-frame': ['frameId'],
  fps: ['fps'],
  'save-sheet': ['label'],
};
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
export function validateCommand(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Object.hasOwn(fields, value.op) ||
    Object.keys(value).some((key) => key !== 'op' && !fields[value.op].includes(key))
  )
    throw new Error('Choose a supported sprite operation and its documented fields.');
  const v = { ...value };
  for (const key of ['layerIndex', 'frameIndex', 'x', 'y', 'offset', 'index'])
    if (v[key] !== undefined && !integer(v[key], 0, key === 'layerIndex' ? 99 : 4095))
      throw new Error(
        'Use nonnegative integer indices and pixel coordinates within the sprite limits.',
      );
  if (v.op === 'inspect') {
    for (const key of ['width', 'height'])
      if (v[key] !== undefined && !integer(v[key], 1, 32))
        throw new Error('Inspect a region of at most 32 × 32 pixels.');
  } else if (v.op === 'paint') {
    if (
      !integer(v.layerIndex, 0, 99) ||
      !integer(v.frameIndex, 0, 1999) ||
      typeof v.expectedHash !== 'string' ||
      !/^\d+-\d+$/.test(v.expectedHash) ||
      !Array.isArray(v.pixels) ||
      v.pixels.length < 1 ||
      v.pixels.length > 4096
    )
      throw new Error(
        'Inspect a layer/frame first, then provide its expectedHash and 1–4096 pixels.',
      );
    const seen = new Set();
    for (const p of v.pixels) {
      if (
        !p ||
        Object.keys(p).length !== 3 ||
        !integer(p.x, 0, 4095) ||
        !integer(p.y, 0, 4095) ||
        typeof p.color !== 'string' ||
        !/^(#[a-f\d]{6}|transparent)$/i.test(p.color)
      )
        throw new Error('Each pixel needs x, y and a #RRGGBB color or transparent.');
      const key = `${p.x},${p.y}`;
      if (seen.has(key)) throw new Error('Specify each pixel only once per edit.');
      seen.add(key);
    }
  } else if (['duplicate-frame', 'move-frame', 'delete-frame'].includes(v.op)) {
    if (typeof v.frameId !== 'string' || !/^\d{1,16}$/.test(v.frameId))
      throw new Error(
        'Use a frameId from current inspection; inspect again after Undo or reopening.',
      );
  }
  if (['insert-frame', 'move-frame'].includes(v.op) && !integer(v.index, 0, 2000))
    throw new Error('Choose a zero-based frame position.');
  if (v.op === 'fps' && !integer(v.fps, 1, 24))
    throw new Error('Choose an animation speed from 1 to 24 frames per second.');
  if (
    v.op === 'save-sheet' &&
    (typeof v.label !== 'string' || !v.label.trim() || v.label.length > 120)
  )
    throw new Error('Name the sheet using up to 120 characters.');
  if (v.op === 'save-sheet') v.label = v.label.trim();
  return v;
}

/** Packed native ABGR pixels become compact palette indices, never full sprite-sheet data. */
export function inspectPixels(frame, x, y, width, height) {
  const palette = [],
    indexes = new Map(),
    rows = [];
  for (let row = y; row < y + height; row++) {
    const values = [];
    for (let col = x; col < x + width; col++) {
      const n = frame.getPixel(col, row) >>> 0;
      const color =
        n >>> 24 === 0
          ? 'transparent'
          : '#' +
            [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24]
              .slice(0, n >>> 24 === 255 ? 3 : 4)
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('');
      if (!indexes.has(color)) {
        indexes.set(color, palette.length);
        palette.push(color);
      }
      values.push(indexes.get(color));
    }
    rows.push(values);
  }
  return { x, y, width, height, palette, rows };
}
