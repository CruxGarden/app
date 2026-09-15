const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let gd, prepareInstances, nativeInstances, validateSceneCommand;
before(async () => {
  ({ prepareInstances, nativeInstances, validateSceneCommand } = await import('./instances.mjs'));
  gd = await require('../Binaries/embuild/GDevelop.js/libGD.js')();
});
function serialized(value) {
  const e = new gd.SerializerElement();
  try {
    value.serializeTo(e);
    return JSON.parse(gd.Serializer.toJSON(e));
  } finally {
    e.delete();
  }
}
function setup() {
  const p = gd.ProjectHelper.createNewGDJSProject(),
    l = p.insertNewLayout('Play', 0);
  l.getObjects().insertNewObject(p, 'Sprite', 'Player', 0);
  l.getLayers().insertNewLayer('Foreground', 1);
  const i = l.getInitialInstances().insertNewInitialInstance();
  i.setObjectName('Player');
  i.setX(10);
  i.setY(20);
  i.getVariables().insertNew('PersonNote', 0).setString('Keep my note');
  return { p, l, i, id: i.getPersistentUuid() };
}
const token = 'a'.repeat(64);
test('native scoped transforms preserve variables and other instances, and duplicate with distinct IDs', () => {
  const { p, l, i, id } = setup();
  try {
    const extra = l.getInitialInstances().insertNewInitialInstance();
    extra.setObjectName('Player');
    extra.setX(99);
    const untouched = serialized(extra);
    const plan = prepareInstances(gd, p, l, {
      op: 'edit-instances',
      scene: 'Play',
      expectedState: token,
      updates: [
        { id, x: 60, width: 96, height: 48, layer: 'Foreground', opacity: 128, flippedX: true },
      ],
    });
    assert.equal(i.getX(), 10);
    plan.apply();
    assert.equal(i.getX(), 60);
    assert.equal(i.getY(), 20);
    assert.equal(i.hasCustomSize(), true);
    assert.equal(i.getCustomWidth(), 96);
    assert.equal(i.getVariables().get('PersonNote').getString(), 'Keep my note');
    assert.deepEqual(serialized(extra), untouched);
    const copies = prepareInstances(gd, p, l, {
      op: 'duplicate-instances',
      scene: 'Play',
      expectedState: token,
      ids: [id],
      dx: 50,
      dy: 0,
    }).apply();
    assert.notEqual(copies[0].getPersistentUuid(), id);
    assert.equal(copies[0].getX(), 110);
    assert.equal(copies[0].getLayer(), 'Foreground');
    assert.equal(copies[0].getVariables().get('PersonNote').getString(), 'Keep my note');
    assert.equal(nativeInstances(gd, l.getInitialInstances()).length, 3);
    prepareInstances(gd, p, l, {
      op: 'delete-instances',
      scene: 'Play',
      expectedState: token,
      ids: [copies[0].getPersistentUuid()],
    }).apply();
    assert.equal(l.getInitialInstances().getInstancesCount(), 2);
    prepareInstances(gd, p, l, {
      op: 'edit-instances',
      scene: 'Play',
      expectedState: token,
      updates: [{ id, naturalSize: true }],
    }).apply();
    assert.equal(i.hasCustomSize(), false);
  } finally {
    p.delete();
  }
});
test('a bad target or layer rejects the entire batch before any native mutation; locks require explicit unlocking', () => {
  const { p, l, i, id } = setup();
  try {
    const before = serialized(l);
    for (const update of [
      { id: 'missing', x: 20 },
      { id, layer: 'Missing' },
    ]) {
      assert.throws(() =>
        prepareInstances(gd, p, l, {
          op: 'edit-instances',
          scene: 'Play',
          expectedState: token,
          updates: update.id === id ? [update] : [{ id, x: 400 }, update],
        }),
      );
      assert.deepEqual(serialized(l), before);
    }
    i.setLocked(true);
    assert.throws(
      () =>
        prepareInstances(gd, p, l, {
          op: 'delete-instances',
          scene: 'Play',
          expectedState: token,
          ids: [id],
        }),
      /Unlock/,
    );
    assert.throws(
      () =>
        prepareInstances(gd, p, l, {
          op: 'edit-instances',
          scene: 'Play',
          expectedState: token,
          updates: [{ id, x: 100 }],
        }),
      /Unlock/,
    );
    prepareInstances(gd, p, l, {
      op: 'edit-instances',
      scene: 'Play',
      expectedState: token,
      updates: [{ id, locked: false, x: 100 }],
    }).apply();
    assert.equal(i.getX(), 100);
    assert.equal(i.isLocked(), false);
  } finally {
    p.delete();
  }
});
test('validates exact fields, paired sizes, state tokens and batch bounds', () => {
  const base = { op: 'edit-instances', scene: 'Play', expectedState: token };
  for (const updates of [
    [],
    [{ id: 'one', width: 20 }],
    [{ id: 'one', x: Infinity }],
    [{ id: 'one', width: 20, height: 20, naturalSize: true }],
    [
      { id: 'one', x: 2 },
      { id: 'one', y: 2 },
    ],
    [{ id: 'one', code: 'x' }],
  ])
    assert.throws(() => validateSceneCommand({ ...base, updates }));
  assert.throws(() =>
    validateSceneCommand({ ...base, expectedState: 'old', updates: [{ id: 'one', x: 2 }] }),
  );
  assert.throws(() =>
    validateSceneCommand({ op: 'delete-instances', scene: 'Play', expectedState: token, ids: [] }),
  );
});
