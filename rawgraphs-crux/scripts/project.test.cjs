const {
  parseDataset,
  serializeProject,
  deserializeProject,
} = require('@rawgraphs/rawgraphs-core')
const { barchart } = require('@rawgraphs/rawgraphs-charts')
const { test } = require('node:test')
const assert = require('node:assert/strict')

function nativeProject() {
  const userData = [
    { Group: 'Control', Value: '2.5' },
    { Group: 'Experiment', Value: '4.25' },
  ]
  return {
    userInput: 'Group,Value\nControl,2.5\nExperiment,4.25',
    userData,
    userDataType: 'csv',
    parseError: null,
    unstackedData: null,
    unstackedColumns: null,
    data: parseDataset(userData),
    separator: ',',
    thousandsSeparator: ',',
    decimalsSeparator: '.',
    locale: 'en-US',
    stackDimension: null,
    dataSource: { type: 'paste' },
    currentChart: barchart,
    mapping: {},
    visualOptions: { width: 800, height: 500 },
    customChart: null,
  }
}
test('native project export preserves original rows and typed scientific values on reopen', () => {
  const state = nativeProject()
  const exported = serializeProject(state)
  const restored = deserializeProject(JSON.stringify(exported), [barchart])
  assert.equal(restored.userInput, state.userInput)
  assert.equal(restored.currentChart, barchart)
  assert.deepEqual(restored.visualOptions, state.visualOptions)
  const parsed = parseDataset(restored.userData, restored.dataTypes, {
    locale: restored.locale,
  })
  assert.deepEqual(parsed.dataset, [
    { Group: 'Control', Value: 2.5 },
    { Group: 'Experiment', Value: 4.25 },
  ])
})
test('changing figure dimensions leaves the native dataset representation intact', () => {
  const state = nativeProject()
  const first = serializeProject(state)
  const next = serializeProject({
    ...state,
    visualOptions: { ...state.visualOptions, width: 1200 },
  })
  assert.deepEqual(next.rawData, first.rawData)
  assert.equal(next.userInput, first.userInput)
  assert.equal(next.visualOptions.width, 1200)
})
