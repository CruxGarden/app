import { expect, it } from 'vitest';
import { PPTIST_TOOLS, pptistCommand } from './pptist-tools';
it('maps PPTist operations and refuses bad input', () => {
  expect(PPTIST_TOOLS.map((t) => [t.name, t.writes])).toEqual([
    ['inspect_pptist', []],
    ['set_pptist_title', ['data/project.json']],
    ['add_pptist_slide', ['data/project.json']],
  ]);
  expect(pptistCommand('inspect_pptist', {})).toEqual({ op: 'inspect' });
  expect(pptistCommand('set_pptist_title', { title: ' Launch deck ' })).toEqual({ op: 'set-title', title: 'Launch deck' });
  expect(pptistCommand('add_pptist_slide', {})).toEqual({ op: 'add-slide' });
  expect(pptistCommand('add_pptist_slide', { text: 'Agenda' })).toEqual({ op: 'add-slide', text: 'Agenda' });
  for (const [name, input] of [
    ['inspect_pptist', { x: 1 }],
    ['set_pptist_title', { title: '' }],
    ['add_pptist_slide', { text: '' }],
    ['add_pptist_slide', { text: 'x', extra: 1 }],
    ['present_pptist', {}],
  ] as const)
    expect(() => pptistCommand(name, input as Record<string, unknown>), name).toThrow();
});
