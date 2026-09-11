import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateProject, installMemoryStorage } from './model.js'
test('bounds native drawing references and rejects traversal and unknown components', () => {
  const doc = project => ({ version: 1, app: 'svgedit', project })
  const ref = { __cruxBinary: { path: `assets/${'a'.repeat(64)}.bin`, kind: 'buffer', type: 'application/json', size: 30 } }
  assert.doesNotThrow(() => validateProject(doc({ svg: ref, preferences: {} })))
  assert.throws(() => validateProject(doc({ svg: { __cruxBinary: { ...ref.__cruxBinary, path: '../other.svg' } } })))
  assert.throws(() => validateProject(doc({ unknown: 'anything' })))
})
test('browser storage is isolated for each mounted drawing', () => {
  globalThis.window = {}
  const first = installMemoryStorage()
  first.setItem('svg-edit-lang', 'fr')
  const second = installMemoryStorage()
  assert.equal(second.getItem('svg-edit-lang'), null)
  assert.equal(first.getItem('svg-edit-lang'), 'fr')
  delete globalThis.window
})
