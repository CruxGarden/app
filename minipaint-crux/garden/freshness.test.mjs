import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateGuard } from './freshness.js';
import { validateCommand } from './commands.js';
function setup() {
  const image = {
    id: 1,
    type: 'image',
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    opacity: 100,
    link: { src: 'blob:decoded' },
    filters: [],
  };
  const state = {
    config: { WIDTH: 400, HEIGHT: 300, layers: [image], layer: image },
    history: { action_history: [], action_history_index: 0 },
    selection: null,
  };
  const guard = createStateGuard(() => state, 'test-session');
  return { state, guard, image };
}
test('fresh state ignores viewport and private caches but refuses uncommitted form, pixels and selection changes', () => {
  const { state, guard, image } = setup();
  const original = guard.current();
  state.config.ZOOM = 2;
  state.config.need_render = true;
  image._cache = { anything: true };
  assert.equal(guard.current(), original);
  assert.equal(guard.require(original), original);
  image.opacity = 80;
  assert.throws(() => guard.require(original), /changed since inspection/);
  let latest = guard.current();
  image.link.src = 'data:image/png;new-pixels';
  assert.throws(() => guard.require(latest));
  latest = guard.current();
  state.selection = { x: 20, y: 30, width: 10, height: 20 };
  assert.throws(() => guard.require(latest));
  latest = guard.current();
  state.selection.x++;
  assert.throws(() => guard.require(latest));
  assert.throws(() => guard.require(undefined));
});
test('Undo/Redo and replacing a history item invalidate tokens even when artwork returns to identical values', () => {
  const { state, guard } = setup();
  state.history.action_history.push({});
  state.history.action_history_index = 1;
  const before = guard.current();
  state.history.action_history_index = 0;
  assert.throws(() => guard.require(before));
  const undone = guard.current();
  state.history.action_history_index = 1;
  assert.throws(() => guard.require(undone));
  const redone = guard.current();
  assert.notEqual(redone, before);
  state.history.action_history[0] = {};
  assert.throws(() => guard.require(redone));
  assert.notEqual(createStateGuard(() => state, 'new-session').current(), guard.current());
});
test('native boundary validates tokens without counting a token as an edit', () => {
  assert.equal(
    validateCommand({ op: 'layer', id: 1, opacity: 80, expectedState: 'mp:test-session:1' })
      .expectedState,
    'mp:test-session:1',
  );
  for (const value of ['', null, 17, 'mp:session:0', 'not-a-token'])
    assert.throws(() => validateCommand({ op: 'layer', id: 1, opacity: 80, expectedState: value }));
  assert.throws(() => validateCommand({ op: 'layer', id: 1, expectedState: 'mp:test:1' }));
  assert.throws(() => validateCommand({ op: 'inspect', expectedState: 'mp:test:1' }));
});

test('completed native action epochs invalidate even unobserved Undo/Redo pairs', () => {
  const { state, guard } = setup();
  const initial = guard.current();
  state.epoch = 2;
  assert.throws(() => guard.require(initial));
});
