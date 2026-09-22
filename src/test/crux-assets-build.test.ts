import { it, expect } from 'vitest';
import { build } from 'vite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cruxAssets from '../../vite-plugin-crux-assets';

it('ships runtime CSS byte-for-byte, retaining tool-relative asset references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crux-asset-build-'));
  const css = ':root { color: rebeccapurple; } .icon { background: url(./icon.svg); }';
  try {
    await mkdir(join(root, 'sample-crux/runtime'), { recursive: true });
    await writeFile(join(root, 'sample-crux/runtime/style.css'), css);
    await writeFile(join(root, 'sample-crux/runtime/icon.svg'), '<svg/>');
    await writeFile(
      join(root, 'index.js'),
      "import css from './sample-crux/runtime/style.css?url'; console.log(css);",
    );
    const result = await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [cruxAssets()],
      assetsInclude: [/-crux\/runtime\//],
      build: { write: false, rollupOptions: { input: join(root, 'index.js') } },
    });
    if (!('output' in result)) throw new Error('Expected one build');
    const styles = result.output.filter(
      (file) => file.type === 'asset' && file.fileName.endsWith('.css'),
    );
    expect(styles).toHaveLength(1);
    const stylesheet = styles[0]!;
    if (stylesheet.type !== 'asset') throw new Error('Expected a stylesheet asset');
    expect(Buffer.from(stylesheet.source).toString()).toBe(css);
    const code = result.output
      .filter((file) => file.type === 'chunk')
      .map((file) => file.code)
      .join('\n');
    expect(code).toContain(styles[0]!.fileName.split('/').at(-1));
    expect(code).not.toContain('transform-only');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
