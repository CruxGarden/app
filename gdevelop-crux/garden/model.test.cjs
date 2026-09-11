const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const reference = text => ({ __cruxBinary: { path: 'assets/' + createHash('sha256').update(text).digest('hex') + '.bin', kind: 'buffer', type: 'application/json', size: Buffer.byteLength(text) } });
test('requires owned component references, not paths outside the Crux or embedded inline documents', async () => {
  const { validateProject } = await import('./model.mjs');
  const doc = { version: 1, app: 'gdevelop', project: { document: reference('{"layouts":[]}'), preferences: reference('{}') } };
  validateProject(doc);
  for (const value of [{ layouts: [] }, { __cruxBinary: { ...doc.project.document.__cruxBinary, path: '../other-game.json' } }, { __cruxBinary: { ...doc.project.document.__cruxBinary, size: -1 } }]) {
    assert.throws(() => validateProject({ ...doc, project: { ...doc.project, document: value } }));
  }
});
test('native project validation preserves events while rejecting unsupported Spine objects', async () => {
  const { validateNativeDocument } = await import('./model.mjs');
  const document = { properties: { name: 'Game' }, layouts: [{ objects: [{ type: 'Sprite' }], events: [{ type: 'BuiltinCommonInstructions::Standard', conditions: [], actions: [] }] }] };
  const original = structuredClone(document);
  validateNativeDocument(document);
  assert.deepEqual(document, original);
  document.layouts[0].objects[0].type = 'SpineObject::SpineObject';
  assert.throws(() => validateNativeDocument(document), /Spine/);
});
test('preferences remain isolated between two native editor instances', async () => {
  const { memoryStorage } = await import('./model.mjs');
  const a = memoryStorage({ 'gd-preferences': '{"theme":"dark"}' });
  const b = memoryStorage();
  a.storage.setItem('gd-preferences', '{"theme":"light"}');
  a.storage.setItem('auth-token', 'transient');
  assert.equal(b.storage.getItem('gd-preferences'), null);
  assert.deepEqual(a.snapshot(), { 'gd-preferences': '{"theme":"light"}' });
});
