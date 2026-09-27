import { describe, it, expect } from 'vitest';
import { missingToolFiles } from './tool-runtime';

const file = (path: string) => ({
  path,
  binary: false,
  read: async () => new Uint8Array(),
});

describe('missingToolFiles', () => {
  it('restores only the tool files the Crux lacks among those its folder rules ignore', () => {
    const files = [
      file('runtime/index.html'),
      file('runtime/app.js'),
      file('src/index.js'),
      file('README.md'),
      file('data/project.json'),
    ];
    const present = ['data/project.json', 'src/index.js', 'runtime/app.js'];
    const ignored = ['runtime/index.html', 'runtime/app.js'];
    expect(missingToolFiles(present, files, ignored).map((f) => f.path)).toEqual([
      'runtime/index.html',
    ]);
  });

  it("leaves a person's deleted source file deleted", () => {
    const files = [file('README.md'), file('runtime/index.html')];
    expect(missingToolFiles([], files, []).map((f) => f.path)).toEqual([]);
    expect(missingToolFiles([], files, ['runtime/index.html']).map((f) => f.path)).toEqual([
      'runtime/index.html',
    ]);
  });
});
