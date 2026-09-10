import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDocument, macroState, macroChanges } from '../model.js';
const document = () =>
  JSON.parse(readFileSync(new URL('../music/instrument.json', import.meta.url), 'utf8'));
test('the real starter patch and presets have valid connections and mapped controls', () => {
  const doc = validateDocument(document());
  for (const macro of doc.macros) assert.equal(macroState(doc.patch, macro).available, true);
});
test('a removed module keeps a recoverable mapping without recreating the module', () => {
  const doc = document(),
    macro = doc.macros[0];
  doc.patch.modules = doc.patch.modules.filter((m) => m.id !== 1);
  doc.patch.cables = doc.patch.cables.filter(
    (c) => c.inputModuleId !== 1 && c.outputModuleId !== 1,
  );
  validateDocument(doc);
  assert.equal(macroState(doc.patch, macro).available, false);
  assert.equal(
    doc.patch.modules.some((m) => m.id === 1),
    false,
  );
});
test('independent rack edits report custom macro values and interpolation stays bounded', () => {
  const doc = document(),
    macro = doc.macros[0];
  doc.patch.modules.find((m) => m.id === 2).params.find((p) => p.id === 2).value += 3;
  assert.equal(macroState(doc.patch, macro).custom, true);
  assert.deepEqual(
    macroChanges(macro, 0).map((c) => c.value),
    macro.bindings.map((b) => b.min),
  );
  assert.throws(() => macroChanges(macro, Infinity));
  assert.throws(() => macroChanges(macro, -1));
});
test('rejects dangling cables, duplicate IDs and nonfinite parameters', () => {
  let doc = document();
  doc.patch.cables[0].inputModuleId = 999;
  assert.throws(() => validateDocument(doc));
  doc = document();
  doc.patch.modules[1].id = 1;
  assert.throws(() => validateDocument(doc));
  doc = document();
  doc.patch.modules[0].params[0].value = NaN;
  assert.throws(() => validateDocument(doc));
});

test('rejects invalid rack coordinates instead of preserving a corrupted layout', () => {
  const doc = document();
  doc.patch.modules[0].pos = [-2147483648, 0];
  assert.throws(() => validateDocument(doc));
});
