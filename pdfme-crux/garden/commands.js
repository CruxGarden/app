export function validateLayoutEdit(c) {
  const keys = { 'add-text': ['name', 'text', 'x', 'y', 'width', 'height', 'fontSize', 'align', 'pageIndex'], 'update-block': ['name', 'text', 'x', 'y', 'width', 'height', 'fontSize', 'align', 'pageIndex'], 'add-page': [], inspect: ['pageIndex', 'offset'] }[c.op];
  if (!keys || Object.keys(c).some(k => k !== 'op' && !keys.includes(k))) throw Error('Use the documented layout inputs.');
  for (const [k, max] of [['pageIndex', 99], ['offset', 500]]) if (c[k] !== undefined && (!Number.isInteger(c[k]) || c[k] < 0 || c[k] > max)) throw Error(`Use a ${k} between 0 and ${max}.`);
  if (c.name !== undefined && (typeof c.name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]{0,59}$/.test(c.name))) throw Error('Use a block name starting with a letter or underscore, up to 60 characters.');
  if (c.text !== undefined && (typeof c.text !== 'string' || c.text.length > 5000)) throw Error('Use text up to 5,000 characters.');
  if (c.align !== undefined && !['left', 'center', 'right'].includes(c.align)) throw Error('Choose left, center or right alignment.');
  for (const k of ['x', 'y', 'width', 'height', 'fontSize']) if (c[k] !== undefined) {
    const min = ['x', 'y'].includes(k) ? 0 : k === 'fontSize' ? 4 : 1;
    const max = k === 'fontSize' ? 200 : 1000;
    if (typeof c[k] !== 'number' || !Number.isFinite(c[k]) || c[k] < min || c[k] > max) throw Error(`${k} must be between ${min} and ${max}.`);
  }
  if (c.op === 'add-text' && (typeof c.text !== 'string' || !c.text.trim() || ['x', 'y', 'width', 'height'].some(k => c[k] === undefined))) throw Error('Provide text and x/y/width/height in millimetres.');
  if (c.op === 'update-block' && (!c.name || !['text', 'x', 'y', 'width', 'height', 'fontSize', 'align'].some(k => c[k] !== undefined))) throw Error('Name a block and supply at least one edit.');
  return c;
}
