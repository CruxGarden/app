const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let gd, prepareEventEdit, inspectEvents, validateEventCommand;
before(async () => {
  ({ prepareEventEdit, inspectEvents, validateEventCommand } = await import('./events.mjs'));
  gd = await require('../Binaries/embuild/GDevelop.js/libGD.js')();
});
const base = { scene: 'Play', expectedState: 'a'.repeat(64) };
function json(v) {
  const s = new gd.SerializerElement();
  try {
    v.serializeTo(s);
    return JSON.parse(gd.Serializer.toJSON(s));
  } finally {
    s.delete();
  }
}
function fixture() {
  const p = gd.ProjectHelper.createNewGDJSProject(),
    l = p.insertNewLayout('Play', 0);
  return { p, l, e: l.getEvents() };
}
function run(p, e, args) {
  const c = { ...base, ...args };
  const before = json(e);
  const mutate = prepareEventEdit(gd, p, e, c);
  assert.deepEqual(json(e), before, 'validation must leave real events untouched');
  mutate();
}
test('nested event organization preserves manual comments and native variables, refuses invalid edits atomically', () => {
  const { p, l, e } = fixture();
  try {
    run(p, e, {
      op: 'edit-event',
      action: 'insert',
      parent: [],
      index: 0,
      kind: 'group',
      text: 'Movement',
    });
    run(p, e, { op: 'edit-event', action: 'insert', parent: [0], index: 0, kind: 'standard' });
    const manual = e.insertNewEvent(p, 'BuiltinCommonInstructions::Comment', 1);
    gd.asCommentEvent(manual).setComment('Person wrote this');
    l.getVariables().insertNew('Score', 0).setValue(7);
    run(p, e, { op: 'edit-event', action: 'update', path: [0, 0], disabled: true });
    run(p, e, { op: 'edit-event', action: 'duplicate', path: [0, 0], parent: [0], index: 1 });
    assert.equal(e.getEventAt(0).getSubEvents().getEventsCount(), 2);
    run(p, e, { op: 'edit-event', action: 'move', path: [0, 1], parent: [], index: 2 });
    assert.equal(e.getEventsCount(), 3);
    assert.equal(e.getEventAt(0).getSubEvents().getEventsCount(), 1);
    run(p, e, { op: 'edit-event', action: 'remove', path: [2] });
    assert.equal(gd.asCommentEvent(e.getEventAt(1)).getComment(), 'Person wrote this');
    assert.equal(l.getVariables().get('Score').getValue(), 7);
    const before = json(p);
    for (const args of [
      { action: 'move', path: [0], parent: [0, 0], index: 0 },
      { action: 'insert', parent: [1], index: 0, kind: 'standard' },
      { action: 'update', path: [0, 0], text: 'bad', disabled: false },
      { action: 'remove', path: [9] },
    ])
      assert.throws(() => prepareEventEdit(gd, p, e, { ...base, op: 'edit-event', ...args }));
    assert.deepEqual(json(p), before);
    const read = inspectEvents(gd, e, { scene: 'Play', path: [], limit: 1 });
    assert.equal(read.nextOffset, 1);
    assert.deepEqual(read.items[0].path, [0]);
  } finally {
    p.delete();
  }
});
test('native instruction insertion, targeted replacement and nested conditions retain other logic', () => {
  const { p, e } = fixture();
  try {
    run(p, e, { op: 'edit-event', action: 'insert', parent: [], index: 0, kind: 'standard' });
    const add = {
      op: 'edit-instruction',
      action: 'insert',
      path: [0],
      list: 'actions',
      instructionPath: [0],
      instruction: { type: 'Delete', parameters: ['Player', ''] },
    };
    // Discover the pinned native parameter contract rather than assuming a hidden slot.
    const m = gd.MetadataProvider.getActionMetadata(p.getCurrentPlatform(), 'Delete');
    add.instruction.parameters = Array.from({ length: m.getParametersCount() }, (_, n) =>
      m.getParameter(n).isCodeOnly() ? '' : 'Player',
    );
    run(p, e, add);
    run(p, e, {
      ...add,
      action: 'update',
      instruction: {
        ...add.instruction,
        parameters: add.instruction.parameters.map((v) => (v === 'Player' ? 'Pickup' : v)),
      },
    });
    assert.equal(
      inspectEvents(gd, e, { scene: 'Play', path: [0], section: 'actions' }).items[0].parameters[0],
      'Pickup',
    );
    const before = json(p);
    for (const instruction of [
      { type: 'Missing::Action', parameters: [] },
      { type: 'Delete', parameters: [] },
      { ...add.instruction, awaited: true },
    ])
      assert.throws(() => prepareEventEdit(gd, p, e, { ...base, ...add, instruction }));
    assert.deepEqual(json(p), before);
    run(p, e, {
      op: 'edit-instruction',
      action: 'insert',
      path: [0],
      list: 'conditions',
      instructionPath: [0],
      instruction: { type: 'BuiltinCommonInstructions::Or', parameters: [] },
    });
    const condition = {
      op: 'edit-instruction',
      action: 'insert',
      path: [0],
      list: 'conditions',
      instructionPath: [0, 0],
      instruction: { type: 'DepartScene', parameters: [''] },
    };
    run(p, e, condition);
    assert.equal(
      inspectEvents(gd, e, {
        scene: 'Play',
        path: [0],
        section: 'conditions',
        instructionParent: [0],
      }).items[0].type,
      'DepartScene',
    );
    assert.throws(() =>
      prepareEventEdit(gd, p, e, {
        ...base,
        ...condition,
        action: 'update',
        instructionPath: [0],
        instruction: { type: 'DepartScene', parameters: [''] },
      }),
    );
    run(p, e, {
      ...condition,
      action: 'update',
      instruction: { ...condition.instruction, inverted: true },
    });
    assert.equal(
      inspectEvents(gd, e, {
        scene: 'Play',
        path: [0],
        section: 'conditions',
        instructionParent: [0],
      }).items[0].inverted,
      true,
    );
    run(p, e, {
      op: 'edit-instruction',
      action: 'remove',
      path: [0],
      list: 'actions',
      instructionPath: [0],
    });
    assert.equal(gd.asStandardEvent(e.getEventAt(0)).getActions().size(), 0);
  } finally {
    p.delete();
  }
});
test('native same-list movement uses destination before removal and invalid schemas fail', () => {
  const { p, e } = fixture();
  try {
    for (let n = 0; n < 3; n++)
      run(p, e, {
        op: 'edit-event',
        action: 'insert',
        parent: [],
        index: n,
        kind: 'comment',
        text: String(n),
      });
    run(p, e, { op: 'edit-event', action: 'move', path: [0], parent: [], index: 3 });
    assert.deepEqual(
      inspectEvents(gd, e, { scene: 'Play' }).items.map((i) => i.text),
      ['1', '2', '0'],
    );
    const valid = { ...base, op: 'edit-event', action: 'remove', path: [0] };
    for (const c of [
      { ...valid, parent: [] },
      { ...valid, path: [] },
      { ...valid, path: [-1] },
      { ...valid, expectedState: 'bad' },
      { ...base, op: 'inspect-events', path: [] },
    ])
      assert.throws(() => validateEventCommand(c));
  } finally {
    p.delete();
  }
});
