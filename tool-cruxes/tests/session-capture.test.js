import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';

// Run the browser bridge against an acknowledging host. Native editor state is
// deliberately separate from the saved document, as with a canvas or workbook.
async function harness(capture, render = () => {}) {
  const listeners = new Map(),
    nodes = new Map(),
    timers = new Map(),
    writes = [];
  let nextTimer = 0;
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {});
    return nodes.get(selector);
  };
  const parent = {
    postMessage(data) {
      if (!['read', 'write'].includes(data.op)) return;
      if (data.op === 'write') writes.push(JSON.parse(data.content));
      queueMicrotask(() =>
        listeners.get('message')({
          source: parent,
          origin: 'http://garden',
          data: {
            type: 'crux:app:result',
            id: data.id,
            result:
              data.op === 'read'
                ? { content: JSON.stringify({ title: 'Test', value: 0 }), fingerprint: 'initial' }
                : { fingerprint: 'written-' + writes.length },
          },
        }),
      );
    },
  };
  const window = {
    parent,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: () => {},
  };
  const context = vm.createContext({
    window,
    document: { querySelector: node, addEventListener: () => {} },
    crypto: { randomUUID },
    structuredClone,
    console,
    confirm: () => true,
    setTimeout: (fn, delay) => {
      timers.set(++nextTimer, { fn, delay });
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    validateProject: (x) => x,
    applyCommand: () => {},
    EFFECTS: [],
  });
  const source = readFileSync(new URL('../shared/session.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/m, '')
    .replace(/export /g, '');
  vm.runInContext(source + '\nglobalThis.openProject = openProject;', context);
  const session = await context.openProject('test', render, () => {}, {
    capture: () => capture(session),
  });
  return {
    session,
    inspect() {
      listeners.get('message')({
        source: parent,
        origin: 'http://garden',
        data: { type: 'crux:app:command', id: 'inspect', command: { op: 'inspect' } },
      });
    },
    writes,
    node,
    runDebounce() {
      for (const [id, t] of timers)
        if (t.delay === 400) {
          timers.delete(id);
          t.fn();
        }
    },
  };
}
test('native edits arriving during asynchronous capture get a second confirmed save', async () => {
  let value = 1,
    release,
    started;
  const didStart = new Promise((resolve) => {
    started = resolve;
  });
  const pause = new Promise((resolve) => {
    release = resolve;
  });
  let captures = 0;
  const h = await harness(async (session) => {
    const snapshot = value;
    if (++captures === 1) {
      started();
      await pause;
    }
    await session.update(
      (d) => {
        d.value = snapshot;
      },
      { render: false, autosave: false },
    );
  });
  h.session.changed();
  const saving = h.session.save();
  await didStart;
  value = 2;
  h.session.changed();
  release();
  await saving;
  assert.equal(h.writes[0].value, 1);
  assert.equal(h.node('#save-state').textContent, 'Unsaved changes');
  h.runDebounce();
  for (let i = 0; i < 20 && h.writes.length < 2; i++) await setImmediate();
  assert.equal(h.writes[1].value, 2);
  assert.equal(h.node('#save-state').textContent, 'Saved in this Crux');
});
test('failed editor capture keeps the draft dirty and permits an explicit retry', async () => {
  let broken = true;
  const h = await harness(async (session) => {
    if (broken) throw new Error('Image is still loading');
    await session.update(
      (d) => {
        d.value = 3;
      },
      { render: false, autosave: false },
    );
  });
  h.session.changed();
  await assert.rejects(h.session.save(), /Image is still loading/);
  assert.equal(h.writes.length, 0);
  assert.equal(h.node('#save-state').textContent, 'Save needs attention');
  broken = false;
  await h.session.save();
  assert.equal(h.writes[0].value, 3);
  assert.equal(h.node('#save-state').textContent, 'Saved in this Crux');
});

test('explicit reload replaces an uncaptured editor buffer even when saved JSON is unchanged', async () => {
  let native = 0;
  const h = await harness(
    async (session) => {
      await session.update(
        (d) => {
          d.value = native;
        },
        { render: false, autosave: false },
      );
    },
    (doc, context) => {
      assert.equal(context.reload, true);
      native = doc.value;
    },
  );
  native = 9;
  h.session.changed();
  await h.session.reload();
  await h.session.save();
  assert.equal(native, 0);
  assert.equal(h.writes.length, 0);
});

test('inspecting a native draft does not cancel its pending autosave', async () => {
  let captures = 0;
  const h = await harness(async (session) => {
    captures++;
    await session.update(
      (d) => {
        d.value = 4;
      },
      { render: false, autosave: false },
    );
  });
  h.session.changed();
  h.inspect();
  for (let i = 0; i < 20 && captures < 1; i++) await setImmediate();
  h.runDebounce();
  for (let i = 0; i < 20 && h.writes.length < 1; i++) await setImmediate();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].value, 4);
});
