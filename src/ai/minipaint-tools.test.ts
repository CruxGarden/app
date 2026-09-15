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

it('routes painting, live filters, crop and shared native history with bounded arguments', () => {
  expect(minipaintCommand('paint_minipaint_stroke', { points: [[4, 5]], size: 12 })).toEqual({
    op: 'add-brush',
    points: [[4, 5]],
    size: 12,
  });
  expect(
    minipaintCommand('edit_minipaint_filter', {
      id: 4,
      action: 'update',
      filterId: 2,
      filter: 'brightness',
      value: -25,
    }).op,
  ).toBe('edit-filter');
  expect(
    minipaintCommand('crop_minipaint_canvas', { x: 10, y: 20, width: 400, height: 300 }).op,
  ).toBe('crop-canvas');
  expect(minipaintCommand('duplicate_minipaint_layer', { id: 4 }).op).toBe('duplicate-layer');
  expect(minipaintCommand('minipaint_history', { direction: 'undo' }).op).toBe('history');
  expect(() =>
    minipaintCommand('edit_minipaint_filter', { id: 4, action: 'add', filter: 'blur', value: 90 }),
  ).toThrow();
  expect(() =>
    minipaintCommand('paint_minipaint_stroke', { points: [[1, 2]], size: 12, path: 'x' }),
  ).toThrow();
});

it('routes shared selection and raster operations with scoped writes and rejects ambiguous edits', () => {
  expect(
    minipaintCommand('select_minipaint_region', {
      id: 3,
      action: 'set',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    }).op,
  ).toBe('selection');
  expect(minipaintCommand('erase_minipaint_pixels', { id: 3, mode: 'selection' }).op).toBe('erase');
  expect(
    minipaintCommand('fill_minipaint_pixels', {
      id: 3,
      mode: 'global',
      x: 10,
      y: 20,
      color: '#123456',
    }).op,
  ).toBe('fill');
  for (const name of ['erase_minipaint_pixels', 'fill_minipaint_pixels'])
    expect(MINIPAINT_TOOLS.find((tool) => tool.name === name)?.writes).toEqual([
      'data/project.json',
      'data/assets/',
    ]);
  expect(() =>
    minipaintCommand('erase_minipaint_pixels', { id: 3, mode: 'stroke', points: [] }),
  ).toThrow();
  expect(() =>
    minipaintCommand('fill_minipaint_pixels', { id: 3, mode: 'selection', color: '#123456', x: 1 }),
  ).toThrow();
});
