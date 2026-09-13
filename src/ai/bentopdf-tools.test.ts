import { expect, it } from 'vitest';
import { BENTOPDF_TOOLS, bentopdfCommand } from './bentopdf-tools';
it('maps BentoPDF operations and refuses bad input', () => {
  expect(BENTOPDF_TOOLS.map((t) => t.name)).toEqual([
    'inspect_bentopdf',
    'set_bentopdf_name',
    'rotate_bentopdf_document',
    'merge_bentopdf_documents',
  ]);
  expect(bentopdfCommand('inspect_bentopdf', {})).toEqual({ op: 'inspect' });
  expect(bentopdfCommand('set_bentopdf_name', { name: ' Garden papers ' })).toEqual({
    op: 'set-name',
    name: 'Garden papers',
  });
  expect(
    bentopdfCommand('rotate_bentopdf_document', { document: 'sample.pdf', degrees: 90 }),
  ).toEqual({
    op: 'rotate',
    document: 'sample.pdf',
    degrees: 90,
  });
  expect(
    bentopdfCommand('rotate_bentopdf_document', {
      document: 'a.pdf',
      degrees: 180,
      output: 'b.pdf',
    }),
  ).toEqual({
    op: 'rotate',
    document: 'a.pdf',
    degrees: 180,
    output: 'b.pdf',
  });
  expect(bentopdfCommand('merge_bentopdf_documents', { documents: ['a.pdf', 'b.pdf'] })).toEqual({
    op: 'merge',
    documents: ['a.pdf', 'b.pdf'],
  });
  for (const [name, input] of [
    ['inspect_bentopdf', { x: 1 }],
    ['set_bentopdf_name', { name: '' }],
    ['rotate_bentopdf_document', { document: 'a.pdf', degrees: 45 }],
    ['rotate_bentopdf_document', { document: '', degrees: 90 }],
    ['rotate_bentopdf_document', { document: 'a.pdf', degrees: 90, replace: true }],
    ['merge_bentopdf_documents', { documents: ['a.pdf'] }],
    ['merge_bentopdf_documents', { documents: ['a.pdf', 3] }],
    ['delete_bentopdf_document', { document: 'a.pdf' }],
  ] as const)
    expect(() => bentopdfCommand(name, input as Record<string, unknown>), name).toThrow();
});
