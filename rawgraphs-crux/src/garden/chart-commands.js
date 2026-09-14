import { validateCommand } from './commands.js'

const typeName = (t) =>
  typeof t === 'string'
    ? t.toLowerCase()
    : t?.type
      ? typeName(t.type)
      : undefined
const fits = (d, t) =>
  d && (!d.validTypes?.length || d.validTypes.includes(typeName(t)))
const invalidParse = (parsed) =>
  parsed.errors?.length ||
  parsed.dataset.some((row) =>
    Object.values(row).some(
      (value) =>
        (typeof value === 'number' && !Number.isFinite(value)) ||
        (value instanceof Date && !Number.isFinite(value.getTime()))
    )
  )
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const dataState = (s) =>
  JSON.stringify({
    rows: s.dataLoader.userData,
    input: s.dataLoader.userInput,
    source: s.dataLoader.dataSource,
    mode: s.dataLoader.dataLoaderMode,
    pendingReplacement: s.dataLoader.replaceRequiresConfirmation,
    types: s.dataLoader.data?.dataTypes,
    separator: s.dataLoader.separator,
    decimal: s.dataLoader.decimalsSeparator,
    group: s.dataLoader.thousandsSeparator,
    locale: s.dataLoader.locale,
    stack: s.dataLoader.stackDimension,
  })
const fullState = (s) =>
  JSON.stringify([
    dataState(s),
    s.currentChart.metadata.id,
    s.mapping,
    s.visualOptions,
  ])
async function hash(text) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  )
  return [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}
export const editableOption = (o) =>
  !o.repeatFor && ['number', 'boolean', 'text', 'color'].includes(o.type)
export function optionChanges(config, values, previous) {
  for (const [key, value] of Object.entries(values)) {
    const o = config[key]
    if (!o || !editableOption(o))
      throw Error(
        `Option ${key} is not a supported scalar control. Inspect the current chart options.`
      )
    if (
      o.type === 'number' &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        Math.abs(value) > 10000 ||
        (o.min !== undefined && value < o.min) ||
        (o.max !== undefined && value > o.max))
    )
      throw Error(`Use a valid numeric value for ${key}.`)
    if (o.type === 'boolean' && typeof value !== 'boolean')
      throw Error(`Use true or false for ${key}.`)
    if (
      o.type === 'color' &&
      (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value))
    )
      throw Error(`Use a six-digit hex color for ${key}.`)
    if (o.type === 'text' && (typeof value !== 'string' || value.length > 500))
      throw Error(`Use bounded text for ${key}.`)
    if (
      o.options &&
      !o.options.some((x) => (typeof x === 'object' ? x.value : x) === value)
    )
      throw Error(`Choose one of the inspected values for ${key}.`)
  }
  const next = { ...previous, ...values }
  if (
    ![next.width, next.height].every(
      (n) => Number.isInteger(n) && n >= 100 && n <= 4000
    )
  )
    throw Error('Chart width and height must be integers from 100 to 4,000.')
  for (const k of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'])
    if (next[k] < 0) throw Error('Margins cannot be negative.')
  if (
    (next.marginLeft || 0) + (next.marginRight || 0) >= next.width ||
    (next.marginTop || 0) + (next.marginBottom || 0) >= next.height
  )
    throw Error('Leave positive drawing space inside the margins.')
  return next
}
export function mappingChanges(s, changes, aggregation) {
  const next = { ...s.mapping }
  for (const [key, columns] of Object.entries(changes)) {
    const d = s.currentChart.dimensions.find((d) => d.id === key)
    if (!d)
      throw Error(`Unknown chart dimension ${key}. Inspect this chart first.`)
    if (!d.multiple && columns.length > 1)
      throw Error(`${key} accepts one column.`)
    for (const c of columns)
      if (
        !Object.hasOwn(s.dataLoader.data?.dataTypes || {}, c) ||
        !fits(d, s.dataLoader.data.dataTypes[c])
      )
        throw Error(
          `Column ${c} is missing or has an incompatible type for ${key}.`
        )
    if (!columns.length) {
      delete next[key]
      continue
    }
    next[key] = {
      value: columns,
      isValid: true,
      mappedType: typeName(s.dataLoader.data.dataTypes[columns[0]]),
      ids: columns.map(() => crypto.randomUUID()),
      ...(d.aggregation
        ? {
            config: {
              aggregation: columns.map((c) =>
                aggregation(d, s.dataLoader.data.dataTypes[c])
              ),
            },
          }
        : {}),
    }
  }
  return next
}
export function chartCommands(
  get,
  {
    parseAndCheckData,
    parseDataset,
    getOptionsConfig,
    getDefaultDimensionAggregation,
  }
) {
  const options = (s) => getOptionsConfig(s.currentChart.visualOptions)
  const parsing = (s) => ({
    locale: s.dataLoader.locale,
    dateLocale: s.dateLocale,
    decimal: s.dataLoader.decimalsSeparator,
    group: s.dataLoader.thousandsSeparator,
  })
  async function inspect(v = {}) {
    const s = get(),
      d = s.dataLoader,
      offset = v.offset || 0,
      limit = v.limit || 10
    const config = options(s)
    return {
      chart: s.currentChart.metadata.id,
      chartName: s.currentChart.metadata.name,
      rows: d.data?.dataset?.length || 0,
      dataHash: await hash(dataState(s)),
      columns: Object.entries(d.data?.dataTypes || {})
        .slice(0, 100)
        .map(([name, type]) => ({ name, type })),
      samples: (d.userData || [])
        .slice(offset, offset + limit)
        .map((row, i) => ({
          row: offset + i,
          values: Object.fromEntries(
            Object.entries(row)
              .slice(0, 50)
              .map(([k, v]) => [
                k,
                typeof v === 'string' && v.length > 300
                  ? v.slice(0, 300) + '…'
                  : v,
              ])
          ),
        })),
      nextOffset:
        offset + limit < (d.userData?.length || 0) ? offset + limit : null,
      dimensions: s.currentChart.dimensions,
      mapping: s.mapping,
      visualOptions: Object.fromEntries(
        Object.entries(s.visualOptions).map(([k, v]) => [
          k,
          JSON.stringify(v)?.length > 1000
            ? '[large value; use native control]'
            : v,
        ])
      ),
      optionControls: Object.entries(config).map(([id, o]) => ({
        id,
        type: o.type,
        label: o.label,
        editable: editableOption(o),
        choices: o.options,
        min: o.min,
        max: o.max,
      })),
      missingDimensions: s.currentChart.dimensions
        .filter((d) => d.required && !s.mapping[d.id]?.value?.length)
        .map((d) => d.id),
      rendered: !!s.rawViz?._node?.querySelector('svg'),
      parseError: d.parseError || null,
      history:
        'The native editor has no document Undo command; confirmed saves retain Garden Growth.',
    }
  }
  function prepare(input) {
    const v = validateCommand(input),
      initial = get(),
      before = fullState(initial)
    return {
      mutates: !['inspect', 'charts'].includes(v.op),
      async apply() {
        if (v.op === 'inspect') return inspect(v)
        if (v.op === 'charts')
          return {
            charts: get()
              .charts.slice(v.offset || 0, (v.offset || 0) + (v.limit || 20))
              .map((c) => ({
                id: c.metadata.id,
                name: c.metadata.name,
                description: c.metadata.description?.slice(0, 300),
              })),
            total: get().charts.length,
          }
        let s = get(),
          d = s.dataLoader
        if (fullState(s) !== before)
          throw Error(
            'The chart changed while saving. Inspect again to preserve the latest edits.'
          )
        if (['load-data', 'cells', 'types'].includes(v.op)) {
          if (d.dataLoaderMode === 'replace' || d.replaceRequiresConfirmation)
            throw Error(
              'Finish or cancel the native data replacement before editing data with tools.'
            )
          if (d.stackDimension)
            throw Error(
              'Unstack the dataset in the native editor before replacing or editing it with these tools.'
            )
          if (v.expectedDataHash !== undefined || d.data || d.userInput) {
            if (
              !v.expectedDataHash ||
              v.expectedDataHash !== (await hash(dataState(s)))
            )
              throw Error(
                'The data changed or already exists. Inspect and supply its current dataHash before editing or replacing it.'
              )
          }
          if (fullState(get()) !== before)
            throw Error(
              'The chart changed while validating data. Inspect again.'
            )
        }
        if (v.op === 'chart') {
          const chart = s.charts.find((c) => c.metadata.id === v.chartId)
          if (!chart)
            throw Error('Choose a bundled chart from list_rawgraphs_charts.')
          if (chart !== s.currentChart) s.handleChartChange(chart)
        } else if (v.op === 'mapping')
          s.setMapping(
            mappingChanges(s, v.dimensions, getDefaultDimensionAggregation)
          )
        else if (['options', 'size'].includes(v.op))
          s.setVisualOptions(
            optionChanges(
              options(s),
              v.op === 'size' ? { width: v.width, height: v.height } : v.values,
              s.visualOptions
            )
          )
        else if (v.op === 'load-data') {
          const [type, rows, error, extra] = parseAndCheckData(v.text, {
            separator: v.delimiter || ',',
          })
          if (
            error ||
            type !== 'csv' ||
            !rows?.length ||
            rows.length > 10000 ||
            !rows.columns?.length ||
            rows.columns.length > 100 ||
            new Set(rows.columns).size !== rows.columns.length ||
            rows.columns.some(
              (c) =>
                !c ||
                c.length > 200 ||
                ['__proto__', 'constructor', 'prototype'].includes(c)
            )
          )
            throw Error(
              'Use a CSV/TSV table with distinct named columns, 1–10,000 rows and at most 100 columns.'
            )
          const parsed = parseDataset(rows, undefined, parsing(s))
          if (invalidParse(parsed))
            throw Error(
              'Some values could not be parsed. Correct the dataset before loading it.'
            )
          for (const [key, m] of Object.entries(s.mapping))
            for (const c of m.value || []) {
              const dim = s.currentChart.dimensions.find((d) => d.id === key)
              if (
                !Object.hasOwn(parsed.dataTypes, c) ||
                !fits(dim, parsed.dataTypes[c])
              )
                throw Error(
                  `Replacement would invalidate the ${key} mapping. Clear that dimension explicitly first.`
                )
            }
          await d.hydrateFromSavedProject({
            userInput: v.text,
            userData: rows,
            userDataType: 'csv',
            parseError: null,
            unstackedColumns: null,
            unstackedData: null,
            dataTypes: parsed.dataTypes,
            separator: extra.separator,
            thousandsSeparator: d.thousandsSeparator,
            decimalsSeparator: d.decimalsSeparator,
            locale: d.locale,
            stackDimension: null,
            dataSource: { type: 'paste' },
          })
          await tick()
          s.setMapping(s.mapping)
        } else if (v.op === 'cells' || v.op === 'types') {
          if (!d.data) throw Error('Load a dataset first.')
          const rows = d.userData.map((r) => ({ ...r })),
            types = { ...d.data.dataTypes }
          if (v.op === 'cells')
            for (const c of v.cells) {
              if (!rows[c.row] || !Object.hasOwn(types, c.column))
                throw Error(
                  'A cell no longer exists. Inspect the current data.'
                )
              rows[c.row][c.column] = c.value
            }
          else
            for (const [key, type] of Object.entries(v.columns)) {
              if (!Object.hasOwn(types, key))
                throw Error('Choose an existing column from inspection.')
              types[key] = type
            }
          const parsed = parseDataset(rows, types, parsing(s))
          if (invalidParse(parsed))
            throw Error(
              'These edits cannot be parsed using the selected column types. Correct the values or types first.'
            )
          for (const [key, m] of Object.entries(s.mapping))
            for (const c of m.value || [])
              if (
                !fits(
                  s.currentChart.dimensions.find((d) => d.id === key),
                  types[c]
                )
              )
                throw Error(
                  `Changing that type would invalidate ${key}; clear its mapping first.`
                )
          if (v.op === 'cells') d.handleInlineEdit(rows)
          else d.coerceTypes(types)
        } else throw Error('Use the chart export control for outputs.')
        await tick()
      },
      result: (value) => value || inspect(),
    }
  }
  return { prepare, inspect }
}
