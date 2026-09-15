const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let gd, inspectGame, readGameContent, gameCatalogue;
before(async () => {
  ({ inspectGame, readGameContent, gameCatalogue } = await import('./inspection.mjs'));
  gd = await require('../Binaries/embuild/GDevelop.js/libGD.js')();
});
function serialized(project) {
  const element = new gd.SerializerElement();
  try {
    project.serializeTo(element);
    return JSON.parse(gd.Serializer.toJSON(element));
  } finally {
    element.delete();
  }
}
test('native game inspection returns scene, instance, behavior and nested-event paths without changing native state', async () => {
  const project = gd.ProjectHelper.createNewGDJSProject();
  try {
    project.setName('Native inspection');
    const scene = project.insertNewLayout('Play', 0);
    const object = scene.getObjects().insertNewObject(project, 'Sprite', 'Player', 0);
    gd.WholeProjectRefactorer.addBehaviorAndRequiredBehaviors(
      project,
      object,
      'TopDownMovementBehavior::TopDownMovementBehavior',
      'Movement',
    );
    const instance = scene.getInitialInstances().insertNewInitialInstance();
    instance.setObjectName('Player');
    instance.setX(42);
    instance.setY(21);
    const parent = scene
      .getEvents()
      .insertNewEvent(project, 'BuiltinCommonInstructions::Standard', 0);
    const child = gd.asStandardEvent(
      parent.getSubEvents().insertNewEvent(project, 'BuiltinCommonInstructions::Standard', 0),
    );
    const action = new gd.Instruction();
    action.setType('Delete');
    action.setParametersCount(2);
    action.setParameter(0, 'Player');
    action.setParameter(1, '');
    child.getActions().push_back(action);
    action.delete();
    const document = serialized(project),
      before = JSON.stringify(document);
    assert.equal(inspectGame(document, { op: 'inspect' }).scenes[0].name, 'Play');
    const instances = inspectGame(document, { op: 'inspect', scene: 'Play', section: 'instances' });
    assert.equal(instances.items[0].value.x, 42);
    assert.equal(instances.items[0].path, '/layouts/0/instances/0');
    const behaviors = await readGameContent(document, {
      op: 'read-content',
      path: '/layouts/0/objects/0/behaviors',
    });
    assert.equal(JSON.parse(behaviors.text)[0].name, 'Movement');
    const event = await readGameContent(document, {
      op: 'read-content',
      path: '/layouts/0/events/0',
    });
    assert.equal(JSON.parse(event.text).events[0].actions[0].type.value, 'Delete');
    assert.equal(JSON.stringify(serialized(project)), before);
    assert.throws(
      () => inspectGame(document, { op: 'inspect', scene: 'Missing', section: 'events' }),
      /existing scene/,
    );
  } finally {
    project.delete();
  }
});
test('inspection bounds large data and reads lossless chunks with change detection and escaped pointers', async () => {
  const document = {
    layouts: [
      {
        name: 'Large',
        objects: Array.from({ length: 80 }, (_, i) => ({
          name: 'Object' + i,
          notes: 'x'.repeat(5000),
        })),
      },
    ],
    'a/b': { '~key': '🙂'.repeat(5000) },
  };
  const first = inspectGame(document, {
    op: 'inspect',
    scene: 'Large',
    section: 'objects',
    limit: 50,
  });
  assert.ok(JSON.stringify(first).length < 12000);
  assert.equal(first.items[0].complete, false);
  assert.ok(first.nextOffset > 0 && first.nextOffset < 80);
  const collected = [];
  let offset = 0,
    fingerprint;
  do {
    const result = await readGameContent(document, {
      op: 'read-content',
      path: '/a~1b/~0key',
      offset,
      limit: 299,
      expectedFingerprint: fingerprint,
    });
    collected.push(result.text);
    offset = result.nextOffset;
    fingerprint = result.contentFingerprint;
  } while (offset !== null);
  assert.equal(JSON.parse(collected.join('')), document['a/b']['~key']);
  document['a/b']['~key'] = 'changed';
  await assert.rejects(
    readGameContent(document, {
      op: 'read-content',
      path: '/a~1b/~0key',
      expectedFingerprint: fingerprint,
    }),
    /changed between reads/,
  );
  for (const path of ['/__proto__', '/layouts/-1', '/layouts/01', '/bad~2pointer'])
    await assert.rejects(readGameContent(document, { op: 'read-content', path }));
  assert.throws(() => inspectGame(document, { op: 'inspect', offset: -1 }));
  assert.throws(() => inspectGame(document, { op: 'inspect', limit: 51 }));
});
test('native catalogue discovers global, object and behavior instructions with ordered parameter metadata', () => {
  const project = gd.ProjectHelper.createNewGDJSProject();
  try {
    const platform = project.getCurrentPlatform();
    for (const kind of ['action', 'condition', 'behavior', 'object']) {
      const found = gameCatalogue(gd, platform, { op: 'catalogue', kind, limit: 2 });
      assert.equal(found.items.length, 2);
      assert.equal(found.nextOffset, 2);
      const next = gameCatalogue(gd, platform, {
        op: 'catalogue',
        kind,
        offset: found.nextOffset,
        limit: 2,
      });
      assert.notEqual(next.items[0].type, found.items[0].type);
    }
    const collision = gameCatalogue(gd, platform, {
      op: 'catalogue',
      kind: 'condition',
      type: 'CollisionNP',
    });
    assert.equal(collision.items[0].parameters[0].type, 'objectList');
    assert.equal(collision.items[0].parameters[1].index, 1);
    const action = gameCatalogue(gd, platform, {
      op: 'catalogue',
      kind: 'action',
      type: 'PlaySound',
    }).items[0];
    assert.equal(action.parameters[0].codeOnly, true);
    assert.ok(action.parametersComplete);
    const movement = gameCatalogue(gd, platform, {
      op: 'catalogue',
      kind: 'action',
      query: 'MaxSpeed',
      limit: 50,
    });
    assert.ok(movement.items.some((item) => item.behaviorType?.includes('TopDownMovement')));
    assert.throws(
      () => gameCatalogue(gd, platform, { op: 'catalogue', kind: 'action', type: 'NotReal' }),
      /Unknown/,
    );
    assert.throws(() =>
      gameCatalogue(gd, platform, { op: 'catalogue', kind: 'action', query: 'x', type: 'Delete' }),
    );
  } finally {
    project.delete();
  }
});
