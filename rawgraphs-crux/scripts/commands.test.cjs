const { test } = require('node:test')
const assert = require('node:assert/strict')
const core = require('@rawgraphs/rawgraphs-core')
const { barchart, bubblechart } = require('@rawgraphs/rawgraphs-charts')
async function setup() {
  const { chartCommands } = await import('../src/garden/chart-commands.js')
  const rows = [
    { Group: 'Manual label', Value: '2.5' },
    { Group: 'Experiment', Value: '4.25' },
  ]
  const s = {
    dataLoader: {
      userInput: 'original input',
      userData: rows,
      data: core.parseDataset(rows),
      locale: 'en-US',
      dataLoaderMode: 'direct',
    },
    currentChart: barchart,
    charts: [barchart, bubblechart],
    mapping: {},
    visualOptions: { width: 800, height: 500, marginLeft: 77 },
    setMapping: (v) => {
      s.mapping = v
    },
    setVisualOptions: (v) => {
      s.visualOptions = v
    },
    handleChartChange: (c) => {
      s.currentChart = c
      s.mapping = {}
    },
  }
  s.dataLoader.handleInlineEdit = (rows) => {
    s.dataLoader.userData = rows
    s.dataLoader.data = core.parseDataset(rows, s.dataLoader.data.dataTypes)
  }
  s.dataLoader.coerceTypes = (types) => {
    s.dataLoader.data = core.parseDataset(s.dataLoader.userData, types)
  }
  return { s, commands: chartCommands(() => s, core) }
}
test('targeted native data edits preserve manual text, mapping and appearance', async () => {
  const { s, commands } = await setup()
  await commands
    .prepare({
      op: 'mapping',
      dimensions: { bars: ['Group'], size: ['Value'] },
    })
    .apply()
  const mapping = structuredClone(s.mapping)
  await commands
    .prepare({
      op: 'cells',
      expectedDataHash: (await commands.inspect()).dataHash,
      cells: [{ row: 1, column: 'Value', value: '9.5' }],
    })
    .apply()
  assert.equal(s.dataLoader.data.dataset[1].Value, 9.5)
  assert.equal(s.dataLoader.userData[0].Group, 'Manual label')
  assert.deepEqual(s.mapping, mapping)
  assert.equal(s.visualOptions.marginLeft, 77)
  assert.equal(s.mapping.size.config.aggregation[0], 'sum')
})
test('rejects stale rows, draft input and state changes during confirmed save', async () => {
  const { s, commands } = await setup()
  const expectedDataHash = (await commands.inspect()).dataHash
  s.dataLoader.userInput = 'a newer manual draft'
  await assert.rejects(
    commands
      .prepare({
        op: 'cells',
        expectedDataHash,
        cells: [{ row: 0, column: 'Value', value: 7 }],
      })
      .apply(),
    /changed/
  )
  const pending = commands.prepare({ op: 'size', width: 900, height: 600 })
  s.visualOptions.marginLeft = 88
  await assert.rejects(pending.apply(), /changed/)
  assert.equal(s.dataLoader.userData[0].Value, '2.5')
  assert.equal(s.visualOptions.width, 800)
})
test('invalid mapped types and native replacements refuse mutation; following command recovers', async () => {
  const { s, commands } = await setup()
  await assert.rejects(
    commands
      .prepare({ op: 'mapping', dimensions: { size: ['Group'] } })
      .apply(),
    /incompatible/
  )
  await commands
    .prepare({ op: 'mapping', dimensions: { size: ['Value'] } })
    .apply()
  const expectedDataHash = (await commands.inspect()).dataHash
  await assert.rejects(
    commands
      .prepare({ op: 'types', expectedDataHash, columns: { Value: 'string' } })
      .apply(),
    /invalidate/
  )
  s.dataLoader.dataLoaderMode = 'replace'
  await assert.rejects(
    commands
      .prepare({
        op: 'cells',
        expectedDataHash,
        cells: [{ row: 0, column: 'Value', value: 7 }],
      })
      .apply(),
    /replacement/
  )
  assert.equal(s.dataLoader.data.dataTypes.Value, 'number')
})
test('native object column types map correctly and unrelated dimensions remain intact', async () => {
  const { s, commands } = await setup()
  s.dataLoader.data.dataTypes.Value = { type: 'number' }
  await commands
    .prepare({
      op: 'mapping',
      dimensions: { size: ['Value'], bars: ['Group'] },
    })
    .apply()
  assert.equal(s.mapping.size.mappedType, 'number')
  await commands.prepare({ op: 'mapping', dimensions: { bars: [] } }).apply()
  assert.equal(s.mapping.bars, undefined)
  assert.equal(s.mapping.size.value[0], 'Value')
})
test('chart discovery and scalar controls use the native catalogue and enforce drawing bounds', async () => {
  const { s, commands } = await setup()
  assert.equal(
    (await commands.prepare({ op: 'charts', offset: 1, limit: 1 }).apply())
      .charts[0].id,
    bubblechart.metadata.id
  )
  await assert.rejects(
    commands.prepare({ op: 'options', values: { marginLeft: 900 } }).apply(),
    /drawing space/
  )
  await assert.rejects(
    commands
      .prepare({ op: 'options', values: { barsOrientation: 'diagonal' } })
      .apply(),
    /inspected values/
  )
  await commands
    .prepare({
      op: 'options',
      values: { barsOrientation: 'horizontal', background: '#faf4e8' },
    })
    .apply()
  assert.equal(s.visualOptions.marginLeft, 77)
  await commands
    .prepare({ op: 'chart', chartId: bubblechart.metadata.id })
    .apply()
  assert.equal(s.currentChart, bubblechart)
  assert.equal(s.dataLoader.userData.length, 2)
})

test('native type coercion changes one unmapped column without rewriting raw cells', async () => {
  const { s, commands } = await setup()
  const original = structuredClone(s.dataLoader.userData)
  await commands
    .prepare({
      op: 'types',
      expectedDataHash: (await commands.inspect()).dataHash,
      columns: { Value: 'string' },
    })
    .apply()
  assert.equal(s.dataLoader.data.dataset[0].Value, '2.5')
  assert.equal(s.dataLoader.data.dataTypes.Group, 'string')
  assert.deepEqual(s.dataLoader.userData, original)
  assert.equal(s.visualOptions.marginLeft, 77)
})

test('date validation uses the native locale and rejects invalid dates without changing the data', async () => {
  const { s, commands } = await setup()
  s.dateLocale = require('d3-time-format/locale/fr-FR.json')
  s.dataLoader.locale = 'fr-FR'
  s.dataLoader.userData = [{ When: '14 septembre 2026' }]
  s.dataLoader.data = core.parseDataset(s.dataLoader.userData, {
    When: 'string',
  })
  let changed = false
  s.dataLoader.coerceTypes = () => {
    changed = true
  }
  await commands
    .prepare({
      op: 'types',
      expectedDataHash: (await commands.inspect()).dataHash,
      columns: { When: 'date' },
    })
    .apply()
  assert.equal(changed, true)
  changed = false
  s.dataLoader.userData = [{ When: 'not a date' }]
  await assert.rejects(
    commands
      .prepare({
        op: 'types',
        expectedDataHash: (await commands.inspect()).dataHash,
        columns: { When: 'date' },
      })
      .apply(),
    /cannot be parsed/
  )
  assert.equal(changed, false)
})
