import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

// Execute the shipped entrypoint under Electron's bundled Node runtime.
test('desktop CLI discovers tools, operates on real Cruxes and retains app approvals', async () => {
  test.setTimeout(120_000);
  const { app, page, dir } = await launchApp();
  const executable = await app.evaluate(() => process.execPath);
  const profile = join(dir, 'userData');
  const cli = (args: string[], input?: string) =>
    new Promise<{ code: number; output: any }>((resolveResult) => {
      const child = execFile(
        executable,
        [resolve('dist/desktop-cli.js'), '--profile', profile, '--json', ...args],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
        (error, stdout) => {
          resolveResult({ code: error ? Number(error.code) || 1 : 0, output: JSON.parse(stdout) });
        },
      );
      child.stdin!.end(input);
    });
  try {
    expect((await cli(['help'])).output.result.help).toContain('call NAME');
    expect((await cli(['call', 'read_file', '[]'])).code).toBe(2);
    expect((await cli(['status'])).output.error.code).toBe('HOST_OFF');
    await enterGarden(page);
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    await expect
      .poll(() => existsSync(join(profile, 'garden-agent-host/.crux/mcp.json')))
      .toBe(true);
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    expect((await cli(['status'])).code).toBe(0);
    const discovery = await cli(['tools']);
    expect(discovery.output.result.tools.map((t: { name: string }) => t.name)).toContain(
      'plant_crux',
    );
    const planted = await cli(
      ['call', 'plant_crux', '-'],
      '{"title":"CLI garden","template":"blank"}',
    );
    expect(planted.code).toBe(0);
    const id = /id: (\S+)/.exec(planted.output.result.content[0].text)![1];
    expect(JSON.stringify((await cli(['list'])).output)).toContain('CLI garden');
    expect((await cli(['open', id])).code).toBe(0);
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'CLI garden',
    );
    const call = (name: string, input: object) =>
      cli(['call', 'call_crux_tool', JSON.stringify({ cruxId: id, name, input })]);
    expect(
      (await call('write_file', { path: 'cli.txt', content: 'Written through app tools' })).code,
    ).toBe(0);
    const { projectFolder } = await storedCrux(page, id);
    expect(readFileSync(join(projectFolder, 'cli.txt'), 'utf8')).toBe('Written through app tools');
    const deletion = call('delete_file', { path: 'cli.txt' });
    await expect(page.getByRole('button', { name: 'Keep', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Keep', exact: true }).first().click();
    expect((await deletion).code).toBe(1);
    expect(existsSync(join(projectFolder, 'cli.txt'))).toBe(true);
    await app.close();
    expect((await cli(['status', '--timeout', '2'])).output.error.code).toBe('UNREACHABLE');
  } finally {
    await app.close().catch(() => {});
  }
});
