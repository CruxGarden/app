// Bounded native drawing commands shared by the host and editor.
export const shapeAttributes = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  text: ['x', 'y', 'font-size'],
};
export const styleAttributes = ['fill', 'stroke', 'stroke-width'];
export function validateDrawingCommand(c) {
  const fields = { 'add-shape': ['type', 'attributes', 'text'], 'set-object': ['elementId', 'attributes', 'text'], 'remove-object': ['elementId'], 'save-svg': ['name'], inspect: ['offset'] }[c.op];
  if (!fields || Object.keys(c).some(k => k !== 'op' && !fields.includes(k))) throw Error('Use the documented drawing inputs.');
  if (['set-object', 'remove-object'].includes(c.op) && (typeof c.elementId !== 'string' || !c.elementId || c.elementId.length > 300)) throw Error('Inspect the drawing for an object ID.');
  if (c.op === 'inspect' && c.offset !== undefined && (!Number.isInteger(c.offset) || c.offset < 0 || c.offset > 100000)) throw Error('Use a nonnegative inspection offset.');
  if (c.op === 'save-svg' && (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 120)) throw Error('Name the SVG output (up to 120 characters).');
  if (c.op === 'add-shape' && !Object.hasOwn(shapeAttributes, c.type)) throw Error('Choose rect, ellipse or text.');
  if (c.text !== undefined && (typeof c.text !== 'string' || c.text.length > 2000)) throw Error('Use literal text up to 2,000 characters.');
  if (c.op === 'add-shape' && c.type !== 'text' && c.text !== undefined) throw Error('Only text objects accept text.');
  if (['add-shape', 'set-object'].includes(c.op)) {
    const attrs = c.attributes ?? {};
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) throw Error('Provide drawing attributes.');
    const allowed = [...new Set(Object.values(shapeAttributes).flat()), ...styleAttributes];
    for (const [key, value] of Object.entries(attrs)) {
      if (!allowed.includes(key)) throw Error('Use geometry, fill, stroke or stroke-width only.');
      if (['fill', 'stroke'].includes(key)) {
        if (typeof value !== 'string' || !/^(#[a-f\d]{6}|none)$/i.test(value)) throw Error('Use a six-digit hex colour or none.');
      } else if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 10000 || (['width', 'height', 'rx', 'ry', 'font-size'].includes(key) && value <= 0) || (key === 'stroke-width' && (value < 0 || value > 100))) throw Error('Use bounded drawing coordinates and positive sizes.');
    }
    if (c.op === 'set-object' && !Object.keys(attrs).length && c.text === undefined) throw Error('Choose an attribute or text to edit.');
    if (c.op === 'add-shape') {
      const required = { rect: ['x', 'y', 'width', 'height'], ellipse: ['cx', 'cy', 'rx', 'ry'], text: ['x', 'y'] }[c.type];
      if (required.some(k => attrs[k] === undefined) || Object.keys(attrs).some(k => ![...shapeAttributes[c.type], ...styleAttributes].includes(k))) throw Error('Supply the geometry for this shape type.');
      if (c.type === 'text' && !c.text?.trim()) throw Error('Give the text object some text.');
    }
  }
  return c;
}
