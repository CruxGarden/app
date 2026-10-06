import { it, expect } from 'vitest';
import { build, createServer } from 'vite';
import { mkdtemp, mkdir, writeFile, rm, realpath, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
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

it('serves original tool bytes in development and preserves the dev filesystem boundary', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'crux-asset-dev-')));
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'crux-asset-private-')));
  const fixtures: Record<string, string | Uint8Array> = {
    'style.css': '.icon { background: url(./icon.svg) }',
    'app.js': 'globalThis.toolStarted = true;',
    'index.html': '<!doctype html><script src="./app.js"></script>',
    'image.png': new Uint8Array([137, 80, 78, 71, 0, 255, 128]),
    'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  };
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [cruxAssets()],
    assetsInclude: [/-crux\/runtime\//],
    server: { host: '127.0.0.1', port: 0, fs: { strict: true, allow: [root] } },
  });
  try {
    await mkdir(join(root, 'sample-crux/runtime'), { recursive: true });
    await Promise.all(
      Object.entries(fixtures).map(([name, bytes]) =>
        writeFile(join(root, 'sample-crux/runtime', name), bytes),
      ),
    );
    await writeFile(join(root, 'sample-crux/runtime/private.pem'), 'private test sentinel');
    const names = [...Object.keys(fixtures), 'private.pem'];
    await writeFile(
      join(root, 'entry.js'),
      names
        .map((name, index) => `import file${index} from './sample-crux/runtime/${name}?url';`)
        .join('\n') + `\nexport default [${names.map((_, index) => `file${index}`).join(',')}];`,
    );
    await server.listen();
    const base = server.resolvedUrls!.local[0];
    // Follow the browser's module URLs: SSR loading skips Vite's HTTP middleware,
    // including its special handling of SVG requests.
    const entry = await (await fetch(new URL('/entry.js', base))).text();
    const imports = [...entry.matchAll(/from "(\/@id\/[^"]+)"/g)].map((match) => match[1]!);
    const urls: string[] = [];
    for (const moduleUrl of imports) {
      const response = await fetch(new URL(moduleUrl, base));
      expect(response.headers.get('content-type')).toContain('javascript');
      const code = await response.text();
      const literal = /export default ("[^"]+")/.exec(code)?.[1];
      expect(literal).toBeDefined();
      urls.push(JSON.parse(literal!));
    }
    expect(urls).toHaveLength(names.length);
    for (const [index, [name, bytes]] of Object.entries(fixtures).entries()) {
      const response = await fetch(new URL(urls[index]!, base));
      expect(response.status, name).toBe(200);
      expect.soft(Buffer.from(await response.arrayBuffer()), name).toEqual(Buffer.from(bytes));
    }
    const foreignStatus = await new Promise<number>((resolve, reject) => {
      const req = request(
        new URL(urls[0]!, base),
        { headers: { Host: 'attacker.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(foreignStatus).toBe(403);
    const cors = await fetch(new URL(urls[0]!, base), {
      headers: { Origin: 'https://attacker.example' },
    });
    expect(cors.headers.get('access-control-allow-origin')).toBeNull();
    expect((await fetch(new URL(urls[0]!, base), { method: 'POST' })).status).toBe(405);
    const secret = await fetch(new URL(urls.at(-1)!, base));
    expect(secret.status).toBe(403);
    expect(await secret.text()).not.toContain('private test sentinel');
    await writeFile(join(root, 'sample-crux/runtime/app.js'), 'updated bytes');
    expect(await (await fetch(new URL(urls[1]!, base))).text()).toBe('updated bytes');
    await writeFile(join(outside, 'outside.js'), 'outside sentinel');
    await unlink(join(root, 'sample-crux/runtime/app.js'));
    await symlink(join(outside, 'outside.js'), join(root, 'sample-crux/runtime/app.js'));
    const escaped = await fetch(new URL(urls[1]!, base));
    expect(escaped.status).toBe(403);
    expect(await escaped.text()).not.toContain('outside sentinel');
    expect((await fetch(new URL('/__crux-assets/unknown', base))).status).toBe(404);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
