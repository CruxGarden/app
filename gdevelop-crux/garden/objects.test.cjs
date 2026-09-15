const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let gd, prepareObjectEdits, inspectObject, validateObjectCommand;
before(async () => {
  ({ prepareObjectEdits, inspectObject, validateObjectCommand } = await import('./objects.mjs'));
  gd = await require('../Binaries/embuild/GDevelop.js/libGD.js')();
});
const token = 'a'.repeat(64);
const base = { scene: 'Play', object: 'Player', scope: 'scene', expectedState: token };
function setup() {
  const p = gd.ProjectHelper.createNewGDJSProject(),
    l = p.insertNewLayout('Play', 0),
    o = l.getObjects().insertNewObject(p, 'Sprite', 'Player', 0);
  gd.WholeProjectRefactorer.addBehaviorAndRequiredBehaviors(
    p,
    o,
    'TopDownMovementBehavior::TopDownMovementBehavior',
    'Move',
  );
  o.getVariables().insertNew('PersonNote', 0).setString('Keep my work');
  const a = new gd.Animation();
  a.setName('Walk');
  a.setUseMultipleDirections(true);
  a.setDirectionsCount(2);
  for (let i = 0; i < 2; i++) {
    const d = a.getDirection(i);
    d.setTimeBetweenFrames(0.1);
    d.setLoop(true);
    const s = new gd.Sprite();
    s.setImageName('original');
    d.addSprite(s);
    s.delete();
  }
  gd.asSpriteConfiguration(o.getConfiguration()).getAnimations().addAnimation(a);
  a.delete();
  return { p, l, o };
}
function json(v) {
  const e = new gd.SerializerElement();
  try {
    v.serializeTo(e);
    return JSON.parse(gd.Serializer.toJSON(e));
  } finally {
    e.delete();
  }
}
test('native behavior properties use typed conversion and preserve unrelated state; invalid whole batches are refused', () => {
  const { p, l, o } = setup();
  try {
    const original = json(p),
      command = {
        ...base,
        op: 'edit-properties',
        behavior: 'Move',
        updates: [
          { name: 'MaxSpeed', value: 420 },
          { name: 'AllowDiagonals', value: false },
        ],
      };
    const plan = prepareObjectEdits(gd, p, l, command);
    assert.deepEqual(json(p), original);
    plan.apply();
    assert.equal(o.getBehavior('Move').getProperties().get('MaxSpeed').getValue(), '420');
    assert.equal(o.getBehavior('Move').getProperties().get('AllowDiagonals').getValue(), 'false');
    assert.deepEqual(json(o).variables, original.layouts[0].objects[0].variables);
    const after = json(p);
    for (const updates of [
      [
        { name: 'MaxSpeed', value: 200 },
        { name: 'Acceleration', value: -1 },
      ],
      [{ name: 'AllowDiagonals', value: 'false' }],
      [{ name: 'Viewpoint', value: 'invalid' }],
      [
        { name: 'MaxSpeed', value: 100 },
        { name: 'Missing', value: 1 },
      ],
    ]) {
      assert.throws(() => prepareObjectEdits(gd, p, l, { ...command, updates }));
      assert.deepEqual(json(p), after);
    }
    const info = inspectObject(gd, o, { section: 'properties', behavior: 'Move', scope: 'scene' });
    assert.equal(info.items.find((i) => i.name === 'MaxSpeed').writable, true);
  } finally {
    p.delete();
  }
});
test('native text object properties and global scope preserve manual typography and reject missing resources', () => {
  const { p, l } = setup();
  try {
    const o = p.getObjects().insertNewObject(p, 'TextObject::Text', 'Caption', 0),
      c = o.getConfiguration();
    c.updateProperty('italic', '1');
    const font = new gd.FontResource();
    font.setName('OriginalFont');
    font.setFile('original.ttf');
    p.getResourcesManager().addResource(font);
    font.delete();
    const command = {
      ...base,
      object: 'Caption',
      scope: 'global',
      op: 'edit-properties',
      updates: [
        { name: 'text', value: 'Our new caption' },
        { name: 'color', value: '30;120;200' },
        { name: 'characterSize', value: 32 },
        { name: 'font', value: 'OriginalFont' },
      ],
    };
    prepareObjectEdits(gd, p, l, command).apply();
    assert.equal(c.getProperties().get('text').getValue(), 'Our new caption');
    assert.equal(c.getProperties().get('italic').getValue(), 'true');
    assert.equal(c.getProperties().get('characterSize').getValue(), '32');
    assert.equal(c.getProperties().get('color').getValue(), '30;120;200');
    assert.equal(c.getProperties().get('font').getValue(), 'OriginalFont');
    const before = json(o);
    assert.throws(() =>
      prepareObjectEdits(gd, p, l, { ...command, updates: [{ name: 'font', value: 'missing' }] }),
    );
    assert.throws(() =>
      prepareObjectEdits(gd, p, l, { ...command, updates: [{ name: 'color', value: '999;0;0' }] }),
    );
    assert.deepEqual(json(o), before);
  } finally {
    p.delete();
  }
});
test('animation timing changes preserve frames, points and other directions; inspection paginates', () => {
  const { p, l, o } = setup();
  try {
    const a = gd.asSpriteConfiguration(o.getConfiguration()).getAnimations().getAnimation(0),
      before = json(o);
    const plan = prepareObjectEdits(gd, p, l, {
      ...base,
      op: 'edit-animation',
      animation: 0,
      direction: 0,
      fps: 12,
      loop: false,
    });
    assert.deepEqual(json(o), before);
    plan.apply();
    assert.equal(a.getDirection(0).getTimeBetweenFrames(), 1 / 12);
    assert.equal(a.getDirection(0).isLooping(), false);
    assert.deepEqual(
      json(o).animations[0].directions[0].sprites,
      before.animations[0].directions[0].sprites,
    );
    assert.deepEqual(json(o).animations[0].directions[1], before.animations[0].directions[1]);
    assert.throws(() =>
      prepareObjectEdits(gd, p, l, {
        ...base,
        op: 'edit-animation',
        animation: 0,
        direction: 99,
        fps: 20,
      }),
    );
    const info = inspectObject(gd, o, {
      section: 'properties',
      behavior: 'Move',
      limit: 2,
      offset: 1,
    });
    assert.equal(info.items.length, 2);
    assert.equal(info.nextOffset, 3);
    assert.equal(inspectObject(gd, o, { section: 'animations' }).items[0].directions[0].fps, 12);
    a.setUseMultipleDirections(false);
    const single = json(o);
    assert.throws(() =>
      prepareObjectEdits(gd, p, l, {
        ...base,
        op: 'edit-animation',
        animation: 0,
        direction: 1,
        fps: 30,
      }),
    );
    assert.deepEqual(json(o), single);
  } finally {
    p.delete();
  }
});
test('strict command shapes reject malformed batches and invalid scalars', () => {
  for (const c of [
    {
      ...base,
      op: 'edit-properties',
      updates: [
        { name: 'MaxSpeed', value: 1 },
        { name: 'MaxSpeed', value: 2 },
      ],
    },
    { ...base, op: 'edit-properties', updates: [{ name: 'MaxSpeed', value: Infinity }] },
    { ...base, op: 'edit-animation', animation: 0, fps: 0 },
    { ...base, op: 'edit-animation', animation: 0, fps: 20, extra: true },
  ])
    assert.throws(() => validateObjectCommand(c));
});
