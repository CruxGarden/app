import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject, listFields } from './document.js';

const schema = { type: 'default', id: 'Form_1', components: [
  { type: 'textfield', key: 'name', label: 'Name', validate: { required: true } },
  { type: 'text', text: 'Hello' },
  { type: 'group', components: [{ type: 'number', key: 'guests', label: 'Guests' }] },
] };
test('a saved form record validates and lists its fields', () => {
  validateProject({ version: 1, app: 'formjs', project: null });
  validateProject({ version: 1, app: 'formjs', project: { name: 'RSVP', schema, saved: '2026-09-13T00:00:00Z' } });
  assert.deepEqual(listFields(schema).map((f) => f.key), ['name', 'guests']);
  assert.equal(listFields(schema)[0].required, true);
});
test('a stranger’s document is refused', () => {
  assert.throws(() => validateProject({ version: 1, app: 'kan', project: null }), /Invalid form project/);
  assert.throws(() => validateProject({ version: 1, app: 'formjs', project: { name: '', schema, saved: '' } }), /Invalid form name/);
  assert.throws(() => validateProject({ version: 1, app: 'formjs', project: { name: 'x', schema: { type: 'other', components: [] }, saved: '' } }), /Invalid form schema/);
  assert.throws(() => validateProject({ version: 1, app: 'formjs', project: { name: 'x', schema: { type: 'default', components: [{ type: 'x y' }] }, saved: '' } }), /Invalid form field/);
});
