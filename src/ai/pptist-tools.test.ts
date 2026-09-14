import { expect, it } from 'vitest';
import { PPTIST_TOOLS, pptistCommand } from './pptist-tools';
it('maps PPTist operations and refuses bad input', () => {
  expect(PPTIST_TOOLS.find((t) => t.name === 'inspect_pptist')?.writes).toEqual([]);
  expect(
    PPTIST_TOOLS.filter((t) => t.name !== 'inspect_pptist').every((t) =>
      t.writes.includes('data/project.json'),
    ),
  ).toBe(true);
  expect(pptistCommand('inspect_pptist', {})).toEqual({ op: 'inspect' });
  expect(pptistCommand('set_pptist_title', { title: ' Launch deck ' })).toEqual({
    op: 'set-title',
    title: 'Launch deck',
  });
  expect(pptistCommand('add_pptist_slide', {})).toEqual({ op: 'add-slide' });
  expect(pptistCommand('add_pptist_slide', { text: 'Agenda' })).toEqual({
    op: 'add-slide',
    text: 'Agenda',
  });
  for (const [name, input] of [
    ['inspect_pptist', { x: 1 }],
    ['set_pptist_title', { title: '' }],
    ['add_pptist_slide', { text: '' }],
    ['add_pptist_slide', { text: 'x', extra: 1 }],
    ['present_pptist', {}],
  ] as const)
    expect(() => pptistCommand(name, input as Record<string, unknown>), name).toThrow();
});

it('validates element coordinates, exact replacements and bounded inspection', () => {
  expect(pptistCommand('inspect_pptist', { slideId: 's', offset: 10, limit: 5 })).toEqual({
    op: 'inspect',
    slideId: 's',
    offset: 10,
    limit: 5,
  });
  expect(
    pptistCommand('edit_pptist_element', {
      slideId: 's',
      elementId: 'e',
      find: 'before',
      replace: '',
      left: 50,
    }).op,
  ).toBe('edit-element');
  for (const [name, input] of [
    ['inspect_pptist', { limit: 51 }],
    ['inspect_pptist', { offset: -1 }],
    ['inspect_pptist', { op: 'delete-slide' }],
    ['edit_pptist_element', { slideId: 's', elementId: 'e' }],
    ['edit_pptist_element', { slideId: 's', elementId: 'e', find: 'missing replacement' }],
    ['edit_pptist_element', { slideId: 's', elementId: 'e', width: NaN }],
    [
      'add_pptist_text',
      { slideId: 's', text: 'Hi', left: 0, top: 0, width: 100, height: 20, color: 'url(evil)' },
    ],
    ['move_pptist_slide', { slideId: 's', index: 1.5 }],
  ] as const)
    expect(() => pptistCommand(name, input)).toThrow();
});
