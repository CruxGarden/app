import { describe, it, expect } from 'vitest';
import { loadTemplate, applyTemplateMeta } from './index';

describe('Notes Crux creation', () => {
  it('carries editable sources, an empty publication selection and the Tigrana license', async () => {
    const template = (await loadTemplate('notes'))!;
    const paths = template.files.map((f) => f.path);
    for (const path of [
      'src/pages/index.astro',
      'src/Notebook.tsx',
      'src/Reader.tsx',
      'src/tigrana/editor/NotesEditor.tsx',
      'scripts/edition.mjs',
      'src/note-file.ts',
      'notebook/Welcome.md',
      'package-lock.json',
      'TIGRANA-LICENSE',
    ])
      expect(paths).toContain(path);
    expect(paths.some((p) => /node_modules|(^|\/)dist\/|src-tauri|\.test\./.test(p))).toBe(false);
    expect(
      JSON.parse(template.files.find((f) => f.path === 'notebook/publish.json')!.content).pages,
    ).toEqual([]);
    expect(applyTemplateMeta({}, template, 'notes')).toMatchObject({
      template: 'notes',
      settings: { entryFile: 'src/pages/index.astro' },
    });
    expect(template.files.find((f) => f.path === 'TIGRANA-LICENSE')!.content).toContain(
      'Dave Haynes',
    );
  });
});
