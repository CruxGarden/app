import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('carries native Moqira tooling and shared helpers with the portable source and runtime', async () => {
  const template = (await loadTemplate('moqira'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'src/App.tsx',
    'src/garden/commands.ts',
    'src/garden/commands-schema.ts',
    'src/garden/native-tools.ts',
    'src/garden/saved-state.ts',
    'src/garden/shared/command-session.js',
    'src/garden/shared/project-image.js',
    'runtime/index.html',
    'UPSTREAM.md',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.context).toContain('App Tools');
});
