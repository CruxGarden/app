import { expect, it } from 'vitest';
import { gdevelopCommand, GDEVELOP_TOOLS } from './gdevelop-tools';
const base = { scene: 'Scene', expectedState: 'a'.repeat(64) };
it('validates complete scene batches before dispatch and prevents operation injection', () => {
  expect(
    gdevelopCommand('edit_gdevelop_instances', {
      ...base,
      updates: [
        { id: 'one', x: 30, width: 96, height: 80 },
        { id: 'two', locked: false },
      ],
    }),
  ).toMatchObject({
    op: 'edit-instances',
    updates: [
      { id: 'one', x: 30 },
      { id: 'two', locked: false },
    ],
  });
  for (const updates of [
    [
      { id: 'one', x: 30 },
      { id: 'two', width: 90 },
    ],
    [
      { id: 'one', x: 30 },
      { id: 'one', y: 40 },
    ],
    [{ id: 'one', unknown: 2 }],
    [{ id: 'one', opacity: 256 }],
    [{ id: 'one', x: Infinity }],
  ])
    expect(() => gdevelopCommand('edit_gdevelop_instances', { ...base, updates })).toThrow();
  expect(() =>
    gdevelopCommand('delete_gdevelop_instances', { ...base, ids: ['one'], op: 'inspect-scene' }),
  ).toThrow();
  expect(() =>
    gdevelopCommand('select_gdevelop_instances', { scene: 'Scene', ids: ['one'] }),
  ).toThrow();
  expect(gdevelopCommand('select_gdevelop_instances', { ...base, ids: [] })).toEqual({
    op: 'select-instances',
    ...base,
    ids: [],
  });
  expect(() => gdevelopCommand('delete_gdevelop_instances', { ...base, ids: [] })).toThrow();
});
it('declares native game writes only for edits, not inspection or selection', () => {
  for (const name of ['inspect_gdevelop_scene', 'select_gdevelop_instances'])
    expect(GDEVELOP_TOOLS.find((t) => t.name === name)?.writes).toEqual([]);
  for (const name of [
    'edit_gdevelop_instances',
    'duplicate_gdevelop_instances',
    'delete_gdevelop_instances',
    'gdevelop_scene_history',
  ])
    expect(GDEVELOP_TOOLS.find((t) => t.name === name)?.writes).toEqual(['data/project.json']);
  expect(() =>
    gdevelopCommand('inspect_gdevelop_scene', {
      scene: 'Scene',
      expectedState: base.expectedState,
    }),
  ).toThrow();
  expect(() =>
    gdevelopCommand('gdevelop_scene_history', { ...base, direction: 'clear' }),
  ).toThrow();
});
