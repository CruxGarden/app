import { expect, it } from 'vitest';
import { BLOCKBENCH_TOOLS, blockbenchCommand } from './blockbench-tools';
it('declares native model/media and output writes while keeping inspection read-only', () => {
  expect(BLOCKBENCH_TOOLS.find((t) => t.name === 'inspect_blockbench')?.writes).toEqual([]);
  for (const tool of BLOCKBENCH_TOOLS.filter((t) => t.name !== 'inspect_blockbench'))
    expect(tool.writes).toContain('data/assets/');
  expect(BLOCKBENCH_TOOLS.find((t) => t.name === 'save_blockbench_gltf')?.writes).toContain(
    'exports/',
  );
});
it('maps bounded native commands without allowing operation injection', () => {
  expect(blockbenchCommand('create_blockbench_model', { name: 'Prop' })).toEqual({
    op: 'create-model',
    name: 'Prop',
  });
  expect(blockbenchCommand('save_blockbench_gltf', { name: 'Prop' })).toEqual({
    op: 'save-gltf',
    label: 'Prop',
  });
  expect(() => blockbenchCommand('inspect_blockbench', { op: 'delete-element' })).toThrow();
  expect(() =>
    blockbenchCommand('update_blockbench_cube', { elementId: 'a', to: [0, Infinity, 0] }),
  ).toThrow();
});
