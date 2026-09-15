import { COMPOSITING_FIELDS, validateCompositingCommand } from './compositing.js';
export { BLEND_MODES } from './compositing.js';
import { RASTER_FIELDS, validateRasterCommand } from './raster.js';
import { validateEditingCommand, EDITING_FIELDS } from './editing.js';
import { validateProjectImagePath } from './shared/project-image.js';
const geometry = ['x', 'y', 'width', 'height', 'rotate'];
const style = ['fontSize', 'fontFamily', 'color'];
const fields = {
  ...EDITING_FIELDS,
  ...RASTER_FIELDS,
  ...COMPOSITING_FIELDS,
  inspect: ['offset', 'limit'],
  layer: [
    'id',
    'name',
    'visible',
    'opacity',
    'composition',
    ...geometry,
    ...style,
    'find',
    'replace',
  ],
  'save-image': ['label'],
  'add-text': ['name', 'text', 'x', 'y', 'width', 'height', ...style],
  'add-rectangle': ['name', 'x', 'y', 'width', 'height', 'color'],
  'add-image': ['name', 'path', 'x', 'y', 'width', 'height'],
  'resize-canvas': ['width', 'height', 'scaleLayers'],
  'delete-layer': ['id'],
  'reorder-layer': ['id', 'direction'],
};
export const FONTS = ['Arial', 'Georgia', 'Verdana', 'Courier New', 'Times New Roman'];
export function validateCommand(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.hasOwn(fields, value.op)
  )
    throw Error('Choose a supported miniPaint operation.');
  const allowed = fields[value.op];
  if (Object.keys(value).some((key) => key !== 'op' && !allowed.includes(key)))
    throw Error('Unexpected miniPaint property.');
  if (allowed.includes('id') && !Number.isSafeInteger(value.id))
    throw Error('Use a layer ID from inspect_minipaint.');
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 200))
    throw Error('Use a layer name up to 200 characters.');
  if (
    value.op === 'save-image' &&
    (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 120)
  )
    throw Error('Name the image output (up to 120 characters).');
  if (
    value.op === 'add-text' &&
    (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 2000)
  )
    throw Error('Use text up to 2000 characters.');
  const bounds = {
    x: [-32768, 32768],
    y: [-32768, 32768],
    width: [1, 8192],
    height: [1, 8192],
    rotate: [-360, 360],
    fontSize: [8, 256],
    opacity: [0, 100],
  };
  for (const [key, [min, max]] of Object.entries(bounds))
    if (
      value[key] !== undefined &&
      (!Number.isFinite(value[key]) || value[key] < min || value[key] > max)
    )
      throw Error(`${key} must be between ${min} and ${max}.`);
  if (
    ['add-text', 'add-rectangle', 'add-image'].includes(value.op) &&
    geometry.slice(0, 4).some((key) => value[key] === undefined)
  )
    throw Error('Specify x, y, width and height in canvas pixels.');
  if (
    value.op === 'resize-canvas' &&
    (!Number.isSafeInteger(value.width) ||
      !Number.isSafeInteger(value.height) ||
      value.width * value.height > 32_000_000)
  )
    throw Error('Use integer canvas dimensions up to 8192 per side and 32 megapixels.');
  if (value.fontFamily !== undefined && !FONTS.includes(value.fontFamily))
    throw Error('Choose a supported local font family.');
  if (
    value.color !== undefined &&
    (typeof value.color !== 'string' || !/^#[a-f\d]{6}$/i.test(value.color))
  )
    throw Error('Use a six-digit hex colour.');
  for (const key of ['visible', 'scaleLayers'])
    if (value[key] !== undefined && typeof value[key] !== 'boolean')
      throw Error(`${key} must be true or false.`);
  if (value.find !== undefined || value.replace !== undefined) {
    if (
      typeof value.find !== 'string' ||
      !value.find ||
      value.find.length > 2000 ||
      typeof value.replace !== 'string' ||
      value.replace.length > 2000 ||
      /[\r\n]/.test(value.find + value.replace)
    )
      throw Error(
        'Use a unique phrase within one text line and a replacement (up to 2000 characters).',
      );
  }
  if (value.op === 'layer' && Object.keys(value).length < 3)
    throw Error('Choose a property to update.');
  if (value.op === 'reorder-layer' && !['up', 'down'].includes(value.direction))
    throw Error('Move the layer up or down in the stack.');
  for (const key of ['offset', 'limit'])
    if (
      value[key] !== undefined &&
      (!Number.isSafeInteger(value[key]) ||
        value[key] < (key === 'limit' ? 1 : 0) ||
        value[key] > (key === 'limit' ? 50 : 10000))
    )
      throw Error('Use a non-negative offset and a limit between 1 and 50.');
  if (value.op === 'add-image') validateProjectImagePath(value.path);
  validateEditingCommand(value);
  validateRasterCommand(value);
  validateCompositingCommand(value);
  return { ...value };
}

export function textData(text, style = {}) {
  const meta = {
    size: style.fontSize ?? 40,
    family: style.fontFamily ?? 'Arial',
    fill_color: style.color ?? '#222222',
  };
  return text.split('\n').map((line) => [{ text: line, meta: { ...meta } }]);
}

export function reviseText(data, value) {
  const lines = JSON.parse(JSON.stringify(data));
  if (value.find !== undefined) {
    const full = lines.map((line) => line.map((span) => span.text).join('')).join('\n');
    const start = full.indexOf(value.find);
    if (start < 0 || full.indexOf(value.find, start + 1) >= 0)
      throw Error('Find text must occur exactly once. Inspect the layer and use a unique phrase.');
    const end = start + value.find.length;
    let offset = 0;
    let inserted = false;
    for (const line of lines) {
      for (const span of line) {
        const text = span.text;
        const next = offset + text.length;
        if (next > start && offset < end) {
          span.text =
            text.slice(0, Math.max(0, start - offset)) +
            (inserted ? '' : value.replace) +
            text.slice(Math.min(text.length, end - offset));
          inserted = true;
        }
        offset = next;
      }
      offset++;
    }
  }
  for (const line of lines)
    for (const span of line) {
      span.meta ??= {};
      if (value.fontSize !== undefined) span.meta.size = value.fontSize;
      if (value.fontFamily !== undefined) span.meta.family = value.fontFamily;
      if (value.color !== undefined) span.meta.fill_color = value.color;
    }
  return lines;
}
