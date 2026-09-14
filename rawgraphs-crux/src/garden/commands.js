/** Bounded host/frame contract. Native chart validation lives beside the adapter. */
const fields = {
  inspect: ['offset', 'limit'],
  charts: ['offset', 'limit'],
  'load-data': ['text', 'delimiter', 'expectedDataHash'],
  cells: ['cells', 'expectedDataHash'],
  types: ['columns', 'expectedDataHash'],
  chart: ['chartId'],
  mapping: ['dimensions'],
  options: ['values'],
  size: ['width', 'height'],
  'save-figure': ['label', 'format'],
}
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v)
export function validateCommand(input) {
  if (
    !plain(input) ||
    !Object.hasOwn(fields, input.op) ||
    Object.keys(input).some((k) => k !== 'op' && !fields[input.op].includes(k))
  )
    throw Error('Use a documented RAWGraphs operation and its fields.')
  const v = { ...input }
  if (['inspect', 'charts'].includes(v.op))
    for (const [key, min, max] of [
      ['offset', 0, 100000],
      ['limit', 1, 50],
    ])
      if (
        v[key] !== undefined &&
        (!Number.isInteger(v[key]) || v[key] < min || v[key] > max)
      )
        throw Error('Use a nonnegative offset and a limit from 1 to 50.')
  if (
    v.expectedDataHash !== undefined &&
    !/^[a-f0-9]{64}$/.test(v.expectedDataHash)
  )
    throw Error('Use the dataHash from a fresh inspection.')
  if (['cells', 'types'].includes(v.op) && !v.expectedDataHash)
    throw Error('Inspect the data first and supply its dataHash.')
  if (
    v.op === 'load-data' &&
    (typeof v.text !== 'string' ||
      !v.text.trim() ||
      v.text.length > 1000000 ||
      ![undefined, ',', '\t', ';'].includes(v.delimiter))
  )
    throw Error(
      'Supply CSV or TSV text up to one million characters and a comma, tab or semicolon delimiter.'
    )
  if (
    v.op === 'chart' &&
    (typeof v.chartId !== 'string' || !v.chartId || v.chartId.length > 150)
  )
    throw Error('Choose a chartId from list_rawgraphs_charts.')
  if (v.op === 'cells') {
    if (!Array.isArray(v.cells) || !v.cells.length || v.cells.length > 100)
      throw Error('Edit 1–100 cells at a time.')
    const seen = new Set()
    for (const c of v.cells) {
      if (
        !plain(c) ||
        Object.keys(c).some((k) => !['row', 'column', 'value'].includes(k)) ||
        !Number.isInteger(c.row) ||
        c.row < 0 ||
        c.row > 9999 ||
        typeof c.column !== 'string' ||
        !c.column ||
        c.column.length > 200 ||
        !Object.hasOwn(c, 'value') ||
        !(
          c.value === null ||
          typeof c.value === 'boolean' ||
          (typeof c.value === 'number' && Number.isFinite(c.value)) ||
          (typeof c.value === 'string' && c.value.length <= 10000)
        )
      )
        throw Error(
          'Use a zero-based row, an inspected column and a bounded scalar cell value.'
        )
      const key = JSON.stringify([c.row, c.column])
      if (seen.has(key)) throw Error('Edit each cell once per command.')
      seen.add(key)
    }
  }
  if (['types', 'mapping', 'options'].includes(v.op)) {
    const obj =
      v[
        v.op === 'types'
          ? 'columns'
          : v.op === 'mapping'
            ? 'dimensions'
            : 'values'
      ]
    if (
      !plain(obj) ||
      !Object.keys(obj).length ||
      Object.keys(obj).length > 30 ||
      Object.keys(obj).some(
        (k) =>
          !k ||
          k.length > 200 ||
          ['__proto__', 'constructor', 'prototype'].includes(k)
      )
    )
      throw Error('Supply 1–30 named fields from inspection.')
    for (const value of Object.values(obj)) {
      if (v.op === 'types' && !['string', 'number', 'date'].includes(value))
        throw Error('Choose string, number or date for a column.')
      if (
        v.op === 'mapping' &&
        (!Array.isArray(value) ||
          value.length > 20 ||
          value.some((c) => typeof c !== 'string' || !c || c.length > 200) ||
          new Set(value).size !== value.length)
      )
        throw Error(
          'Map each dimension to an ordered list of up to 20 distinct column names; [] clears it.'
        )
      if (
        v.op === 'options' &&
        !(
          (typeof value === 'number' &&
            Number.isFinite(value) &&
            Math.abs(value) <= 10000) ||
          typeof value === 'boolean' ||
          (typeof value === 'string' && value.length <= 500)
        )
      )
        throw Error(
          'Use bounded number, boolean or text values for the editable options returned by inspection.'
        )
    }
  }
  if (
    v.op === 'size' &&
    ![v.width, v.height].every(
      (n) => Number.isInteger(n) && n >= 100 && n <= 4000
    )
  )
    throw Error('Choose figure dimensions between 100 and 4,000 pixels.')
  if (v.op === 'save-figure') {
    if (
      typeof v.label !== 'string' ||
      !v.label.trim() ||
      v.label.length > 120 ||
      ![undefined, 'png', 'svg', 'jpeg', 'rawgraphs'].includes(v.format)
    )
      throw Error('Name the output and choose png, svg, jpeg or rawgraphs.')
    v.label = v.label.trim()
    v.format ??= 'png'
  }
  return v
}
