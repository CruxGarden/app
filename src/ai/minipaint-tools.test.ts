import { expect, it } from 'vitest';
import { MINIPAINT_TOOLS, minipaintCommand } from './minipaint-tools';

it('declares scoped image imports and maps native canvas/layer commands', () => {
  expect(MINIPAINT_TOOLS.find((tool) => tool.name === 'inspect_minipaint')?.writes).toEqual([]);
  expect(MINIPAINT_TOOLS.find((tool) => tool.name === 'add_minipaint_image')?.writes).toContain(
    'data/assets/',
  );
  expect(
    minipaintCommand('resize_minipaint_canvas', { width: 1200, height: 600, scaleLayers: true }),
  ).toEqual({ op: 'resize-canvas', width: 1200, height: 600, scaleLayers: true });
  expect(minipaintCommand('save_minipaint_image', { name: ' Banner ' })).toEqual({
    op: 'save-image',
    label: 'Banner',
  });
  for (const [name, value] of [
    ['inspect_minipaint', { extra: true }],
    ['update_minipaint_layer', { id: 1, find: 'Friday' }],
    [
      'add_minipaint_image',
      { path: 'https://outside.test/photo.png', x: 0, y: 0, width: 100, height: 100 },
    ],
    ['save_minipaint_image', { name: '' }],
    ['inspect_minipaint', { op: 'delete-layer' }],
  ] as const)
    expect(() => minipaintCommand(name, value)).toThrow();
});
