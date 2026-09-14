import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, validateBounds } from './commands.js';
import { modelCommands } from './model-commands.js';

test('rejects malformed geometry and unscoped operations', () => {
  const cube = { op: 'add-cube', name: 'Leg', from: [0, 0, 0], to: [1, 10, 1] };
  assert.equal(validateCommand(cube).name, 'Leg');
  for (const value of [
    { ...cube, file: 'other' },
    { ...cube, to: [0, 10, 1] },
    { ...cube, rotation: [0, Infinity, 0] },
    { ...cube, from: [0, 1] },
    { op: 'update-cube', elementId: 'a' },
    { op: 'move-element', elementId: 'a' },
    { op: 'inspect', limit: 51 },
    { op: 'save-gltf', label: ' ' },
  ])
    assert.throws(() => validateCommand(value));
  assert.throws(() => validateBounds([1, 0, 0], [0, 1, 1]));
  assert.equal(validateCommand({ op: 'save-model', label: ' Prop ' }).label, 'Prop');
});

test('rechecks active model and native part state after the confirmed pre-save', async () => {
  class Cube {
    constructor() {
      this.uuid = 'cube';
      this.name = 'Manual';
      this.from = [0, 0, 0];
      this.to = [1, 1, 1];
    }
    getSaveCopy() {
      return { name: this.name, from: this.from, to: this.to };
    }
  }
  class Group {}
  const cube = new Cube();
  const project = { elements: [cube], groups: [] };
  const w = { Project: project, Format: { id: 'free' }, Cube, Group };
  const api = modelCommands(w, {});
  const edit = api.prepare({ op: 'update-cube', elementId: 'cube', to: [2, 2, 2] });
  cube.name = 'Person changed this';
  await assert.rejects(edit.apply(), /changed while saving/);
  assert.deepEqual(cube.to, [1, 1, 1]);
  const reparented = api.prepare({ op: 'update-cube', elementId: 'cube', to: [2, 2, 2] });
  cube.parent = { uuid: 'manually-chosen-group' };
  await assert.rejects(reparented.apply(), /changed while saving/);
  assert.deepEqual(cube.to, [1, 1, 1]);
  const rename = api.prepare({ op: 'rename-element', elementId: 'cube', name: 'New name' });
  w.Project = { elements: [], groups: [] };
  await assert.rejects(rename.apply(), /active model changed/);
  assert.equal(cube.name, 'Person changed this');
});

test('rejects cycles, nonempty group deletion and format-specific geometry before native edits', () => {
  class Cube {}
  class Group {
    constructor(id, parent = 'root') {
      this.uuid = id;
      this.parent = parent;
      this.children = [];
    }
  }
  const root = new Group('a'),
    child = new Group('b', root);
  root.children = [child];
  const w = {
    Project: { elements: [], groups: [root, child] },
    Format: { id: 'free' },
    Cube,
    Group,
    Outliner: { ROOT: 'root' },
  };
  const api = modelCommands(w, {});
  assert.throws(
    () => api.prepare({ op: 'move-element', elementId: 'a', parentId: 'b' }),
    /ancestors/,
  );
  assert.throws(() => api.prepare({ op: 'delete-element', elementId: 'a' }), /children/);
  w.Format.id = 'bedrock';
  assert.throws(
    () => api.prepare({ op: 'add-cube', name: 'Part', from: [0, 0, 0], to: [1, 1, 1] }),
    /Generic/,
  );
});
