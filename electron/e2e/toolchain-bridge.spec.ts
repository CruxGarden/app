import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

test('bundled pnpm installs a local dependency and builds with the desktop Node runtime', async () => {
  const instance = await launchApp();
  try {
    const result = await instance.page.evaluate(async () => {
      const api = window.electronAPI!;
      const folder = await api.project.createFolder('toolchain-proof');
      const files = {
        'package.json': JSON.stringify({
          name: 'toolchain-proof',
          version: '1.0.0',
          private: true,
          scripts: { build: 'node build.cjs' },
          dependencies: { 'local-proof': 'file:./local-proof' },
        }),
        'local-proof/package.json': JSON.stringify({
          name: 'local-proof',
          version: '1.0.0',
          main: 'index.cjs',
        }),
        'local-proof/index.cjs': "module.exports = 'Built from the local dependency';",
        'build.cjs': `
          const fs = require('node:fs');
          fs.mkdirSync('dist', { recursive: true });
          fs.writeFileSync('dist/index.html', '<h1>' + require('local-proof') + '</h1>');
          fs.writeFileSync('dist/runtime.json', JSON.stringify({ electron: process.versions.electron }));
        `,
      };
      for (const [name, text] of Object.entries(files))
        await api.project.writeFile(folder, name, new TextEncoder().encode(text));
      const installed = await api.toolchain.install(folder);
      const built = installed.code === 0 ? await api.toolchain.build(folder) : null;
      return { folder, installed, built };
    });
    expect(result.installed.code, result.installed.log).toBe(0);
    expect(result.built?.code, result.built?.log).toBe(0);
    expect(result.built?.distFiles).toEqual(['dist/index.html', 'dist/runtime.json']);
    expect(readFileSync(join(result.folder, 'dist/index.html'), 'utf8')).toBe(
      '<h1>Built from the local dependency</h1>',
    );
    expect(
      JSON.parse(readFileSync(join(result.folder, 'dist/runtime.json'), 'utf8')).electron,
    ).toBeTruthy();
  } finally {
    await instance.app.close();
  }
});
