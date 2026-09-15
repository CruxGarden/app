import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from './commands.js';
import { compositionPlan } from './compositing.js';
const layer = (id, extra = {}) => ({
  id,
  order: id,
  type: 'rectangle',
  visible: true,
  composition: 'source-over',
  ...extra,
});
const config = (...layers) => ({ WIDTH: 400, HEIGHT: 240, layers });

test('selected merge preserves order and refuses incomplete or backdrop-dependent groups', () => {
  const state = config(layer(3), layer(1), layer(2), layer(4));
  const before = structuredClone(state);
  assert.deepEqual(
    compositionPlan(state, { op: 'merge-layers', mode: 'selected', ids: [3, 2] }).layers.map(
      (l) => l.id,
    ),
    [2, 3],
  );
  assert.deepEqual(state, before);
  for (const ids of [
    [1, 3],
    [1, 99],
  ])
    assert.throws(() => compositionPlan(state, { op: 'merge-layers', mode: 'selected', ids }));
  for (const changed of [
    layer(2, { visible: false }),
    layer(2, { type: null }),
    layer(2, { composition: 'multiply' }),
    layer(3, { composition: 'source-atop' }),
  ]) {
    const layers = [layer(1), layer(2), layer(3)].map((l) => (l.id === changed.id ? changed : l));
    assert.throws(() =>
      compositionPlan(config(...layers), { op: 'merge-layers', mode: 'selected', ids: [1, 2] }),
    );
  }
});

test('visible merge retains hidden/empty layers and rasterization accepts hidden native data', () => {
  const state = config(
    layer(1),
    layer(2, { visible: false }),
    layer(3, { composition: 'screen' }),
    layer(4, { type: null }),
  );
  const plan = compositionPlan(state, { op: 'merge-layers', mode: 'visible' });
  assert.deepEqual(
    plan.layers.map((l) => l.id),
    [1, 3],
  );
  assert.deepEqual([plan.order, plan.width, plan.height], [3, 400, 240]);
  assert.equal(compositionPlan(state, { op: 'rasterize-layer', id: 2 }).layers[0].visible, false);
  assert.throws(() => compositionPlan(state, { op: 'rasterize-layer', id: 4 }));
  assert.throws(() =>
    compositionPlan(config(layer(1, { visible: false })), { op: 'merge-layers', mode: 'visible' }),
  );
  assert.throws(() =>
    compositionPlan({ ...state, WIDTH: 8192, HEIGHT: 8192 }, { op: 'rasterize-layer', id: 1 }),
  );
});

test('compositing validation rejects ambiguous IDs, extra inputs and unsupported legacy modes', () => {
  for (const command of [
    { op: 'merge-layers', mode: 'selected', ids: [1, 1] },
    { op: 'merge-layers', mode: 'selected', ids: [1] },
    { op: 'merge-layers', mode: 'selected', ids: [1, '2'] },
    { op: 'merge-layers', mode: 'visible', ids: [1, 2] },
    { op: 'merge-layers', mode: 'all' },
    { op: 'rasterize-layer', id: 1, scale: 2 },
    { op: 'layer', id: 1, composition: 'darker' },
    { op: 'layer', id: 1, composition: '__proto__' },
  ])
    assert.throws(() => validateCommand(command));
  assert.equal(
    validateCommand({ op: 'layer', id: 1, composition: 'multiply' }).composition,
    'multiply',
  );
  assert.equal(validateCommand({ op: 'rasterize-layer', id: 1 }).id, 1);
});
