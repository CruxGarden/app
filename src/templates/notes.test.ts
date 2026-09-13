import { describe, it, expect } from 'vitest';
import { loadTemplate, applyTemplateMeta } from './index';

describe('Notes Crux creation', () => {
  it('carries the actual Tigrana, the Garden storage, the edition script, the runtime and the license', async () => {
    const template = (await loadTemplate('notes'))!;
    const paths = template.files.map((f) => f.path);
    for (const path of [
      'index.html',
      'src/App.tsx',
      'src/main.tsx',
      'src/lib/notebookStorage.ts',
      'src/garden/bridge.ts',
      'src/garden/notebook-storage.ts',
      'src/garden/boot.ts',
      'scripts/edition.mjs',
      'runtime/index.html',
      'notebook/publish.json',
      'package-lock.json',
      'LICENSE',
      'UPSTREAM.md',
      '.cruxignore',
    ])
      expect(paths).toContain(path);
    expect(paths.some((p) => /node_modules|(^|\/)dist\/|src-tauri|\.test\./.test(p))).toBe(false);
    expect(paths).not.toContain('notebook/Welcome.md'); // Tigrana writes its own welcome note
    expect(
      JSON.parse(template.files.find((f) => f.path === 'notebook/publish.json')!.content).pages,
    ).toEqual([]);
    expect(applyTemplateMeta({}, template, 'notes')).toMatchObject({
      template: 'notes',
      settings: { entryFile: 'runtime/index.html' },
    });
    expect(template.files.find((f) => f.path === 'LICENSE')!.content).toContain('Dave Haynes');
    expect(template.files.find((f) => f.path === 'runtime/index.html')!.encoding).toBe('asset-url');
  }, 30000);
});
