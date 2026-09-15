import { expect, it } from 'vitest';
import { gdevelopCommand, GDEVELOP_TOOLS } from './gdevelop-tools';
const base = { scene: 'Scene', object: 'Player', scope: 'scene', expectedState: 'a'.repeat(64) };
it('validates typed object batches and prevents operation injection', () => {
  expect(
    gdevelopCommand('edit_gdevelop_properties', {
      ...base,
      behavior: 'Move',
      updates: [
        { name: 'MaxSpeed', value: 300 },
        { name: 'AllowDiagonals', value: false },
      ],
    }),
  ).toMatchObject({ op: 'edit-properties' });
  for (const input of [
    { ...base, updates: [] },
    { ...base, updates: [{ name: 'x', value: NaN }] },
    {
      ...base,
      updates: [
        { name: 'x', value: 1 },
        { name: 'x', value: 2 },
      ],
    },
    { ...base, updates: [{ name: 'x', value: 1 }], op: 'inspect-object' },
  ])
    expect(() => gdevelopCommand('edit_gdevelop_properties', input)).toThrow();
  expect(() =>
    gdevelopCommand('edit_gdevelop_animation', { ...base, animation: 0, fps: 0 }),
  ).toThrow();
  expect(() =>
    gdevelopCommand('inspect_gdevelop_object', { ...base, section: 'behaviors', behavior: 'Move' }),
  ).toThrow();
});
it('declares writes only for native mutations', () => {
  expect(GDEVELOP_TOOLS.find((t) => t.name === 'inspect_gdevelop_object')?.writes).toEqual([]);
  for (const name of ['edit_gdevelop_properties', 'edit_gdevelop_animation'])
    expect(GDEVELOP_TOOLS.find((t) => t.name === name)?.writes).toEqual(['data/project.json']);
});
