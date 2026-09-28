import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { request } from 'node:http';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PreviewServer } =
  require('../dist/preview-server.js') as typeof import('../src/preview-server');

test('static preview serves public files but refuses private paths, symlinks and foreign Hosts', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'crux-preview-security-'));
  const folder = join(scratch, 'project');
  const write = (name: string, text = 'private sentinel') => {
    const target = join(folder, name);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, text);
  };
  write('index.html', 'public page');
  write('nested/index.html', 'nested page');
  write('runtime/app.js', 'public runtime');
  write('.cruxignore', 'runtime/\n'); // capture exclusions can be essential preview assets
  for (const name of [
    '.crux/mcp.json',
    '.crux/local.env',
    '.env',
    '.env.local',
    '.git/config',
    'nested/.env',
    'private.key',
  ])
    write(name);
  writeFileSync(join(scratch, 'outside.txt'), 'outside sentinel');
  symlinkSync(join(scratch, 'outside.txt'), join(folder, 'outside.txt'));
  symlinkSync(join(folder, '.crux'), join(folder, 'alias'));
  symlinkSync(join(scratch, 'outside.txt'), join(folder, 'nested/index-link.html'));
  const manager = new PreviewServer(resolve);
  try {
    const url = await manager.start(folder);
    const get = (pathname: string, host = new URL(url).host) =>
      new Promise<{ status: number; body: string }>((accept, reject) => {
        const req = request(url + pathname, { headers: { Host: host } }, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => accept({ status: res.statusCode!, body }));
        });
        req.on('error', reject);
        req.end();
      });
    expect(await get('/')).toEqual({ status: 200, body: 'public page' });
    expect(await get('/nested/')).toEqual({ status: 200, body: 'nested page' });
    expect(await get('/runtime/app.js')).toEqual({ status: 200, body: 'public runtime' });
    for (const name of [
      '.crux/mcp.json',
      '.crux/local.env',
      '.env',
      '.env.local',
      '.git/config',
      'nested/.env',
      'private.key',
      '%2ecrux/mcp.json',
      'alias/mcp.json',
      'outside.txt',
      'nested/index-link.html',
      '%2e%2e%2foutside.txt',
    ]) {
      const result = await get('/' + name);
      expect.soft(result.status, name).toBe(403);
      expect.soft(result.body, name).not.toContain('sentinel');
    }
    expect.soft((await get('/', 'attacker.example')).status).toBe(403);
    expect.soft((await get('/', '127.0.0.1.attacker.example')).status).toBe(403);
    expect.soft((await get('/%ZZ')).status).toBe(400);
    expect((await get('/missing.txt')).status).toBe(404);
  } finally {
    await manager.stopAll();
    rmSync(scratch, { recursive: true, force: true });
  }
});
