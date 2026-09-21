import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { home } from './game-cruxspace-helpers';

/**
 * The Runner board (ADR 0053): a Cruxspace holding a Stack Crux and a Runner.
 *
 * What matters here is that the Runner is a *board*, not an owner. It reads
 * the Cruxspace, lists what can run, starts a service together with what that
 * service needs, and shows what is running whoever started it.
 */
function folderFor(dir: string, match: string): string {
  const garden = join(dir, 'garden');
  const found = readdirSync(garden).find((name) => name.includes(match));
  if (!found) throw new Error(`no crux folder matching ${match}`);
  return join(garden, found);
}

function hasRunner(): boolean {
  for (const program of ['docker', 'podman']) {
    try {
      execFileSync(program, ['compose', 'version'], { stdio: 'ignore', timeout: 10_000 });
      return true;
    } catch {
      /* try the next */
    }
  }
  return false;
}

test('the Runner reads a Cruxspace, and starts a service with what it needs', async () => {
  test.setTimeout(300_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);

    // A Stack Crux, with a service that depends on another.
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Stack/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const stackFolder = folderFor(dir, 'my-stack');
    writeFileSync(
      join(stackFolder, 'compose.yaml'),
      `services:
  # The thing everything waits for.
  store:
    image: alpine:3
    command: ["sleep", "120"]

  # Waits for the store.
  worker:
    image: alpine:3
    command: ["sleep", "120"]
    depends_on:
      - store

  # Nothing asks for this one.
  bystander:
    image: alpine:3
    command: ["sleep", "120"]
`,
    );

    // A Runner beside it.
    await home(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Runner/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();

    // Put them in one Cruxspace: that is what makes them a workspace.
    await home(page);
    await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
    await page.getByLabel('Cruxspace name').fill('Platform');
    await page.getByLabel('Shared brief').fill('The stack and the board that conducts it.');
    for (const name of ['My stack', 'My workspace'])
      await page.getByRole('checkbox', { name, exact: true }).check();
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();

    // Open the Runner and let it discover.
    await page
      .getByRole('region', { name: 'Cruxspaces', exact: true })
      .getByRole('button', { name: 'Open My workspace', exact: true })
      .click();
    const board = page.frameLocator('iframe[data-crux-id]');
    await expect(board.locator('#services')).toContainText('worker', { timeout: 60_000 });
    await expect(board.locator('#services')).toContainText('store');
    await expect(board.locator('#services')).toContainText('The thing everything waits for.');
    await expect(board.locator('#about')).toContainText('3 services');
    // Every row comes from the Stack until a Project Crux offers one.
    await expect(board.locator('.service .from').first()).toContainText('from stack');

    test.skip(!hasRunner(), 'this machine has no Docker or Podman');

    // Start one service: it brings up what that service needs, and nothing else.
    const running = () =>
      execFileSync('docker', ['ps', '--format', '{{.Names}}'], {
        encoding: 'utf8',
        timeout: 20_000,
      });
    await board
      .locator('article.service')
      .filter({ hasText: 'worker' })
      .getByRole('button', { name: 'Start' })
      .click();
    await expect.poll(() => running(), { timeout: 240_000, intervals: [2000] }).toMatch(/worker/);
    // Its dependency came up with it.
    expect(running()).toMatch(/store/);
    // The one nobody asked for did not.
    expect(running()).not.toMatch(/bystander/);

    // The board shows what is running because it asks, not because it started it.
    await expect(board.locator('article.service').filter({ hasText: 'worker' })).toContainText(
      /running/i,
      { timeout: 60_000 },
    );

    await board.getByRole('button', { name: 'Stop everything' }).click();
    await expect
      .poll(() => running(), { timeout: 180_000, intervals: [2000] })
      .not.toMatch(/worker/);
  } finally {
    await app.close();
  }
});
