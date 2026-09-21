import { test, expect } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * A Link Crux hooks an existing project into Crux Garden.
 *
 * The journey makes a small project in a temporary folder, approves it the way
 * the picker would, and runs a script from the bench. What matters:
 *
 *   · the page reads the real package.json and offers its scripts;
 *   · a run gets the settings the Crux hands it, which is how a Stack's
 *     connections reach the code;
 *   · nothing runs from a folder the person never chose;
 *   · the choice is kept, so tomorrow is one press.
 */
function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

test('a link crux runs the project it points at, with the settings it is given', async () => {
  test.setTimeout(240_000);
  const { app, page, dir } = await launchApp();
  try {
    // A project outside the Garden, as a real checkout would be.
    const project = join(dir, 'a-project');
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify(
        {
          name: 'hello-project',
          scripts: {
            greet:
              "node -e \"console.log('greeting from', process.env.WHO || 'nobody', 'on', process.env.PORT || 'no port')\"",
            build: 'node -e "process.exit(0)"',
          },
        },
        null,
        2,
      ),
    );

    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Link/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const folder = cruxFolder(dir);

    const bench = page.frameLocator('iframe[data-crux-id]');
    await expect(bench.getByRole('button', { name: 'Choose folder…' })).toBeVisible({
      timeout: 30_000,
    });

    // The picker cannot be driven from a test, so approve the folder the way
    // choosing it would, then point the Crux at it — which is exactly what a
    // Crux from someone else could try, and must not be able to do without
    // this approval.
    // Approvals live beside the app's own data, not in the Garden.
    writeFileSync(
      join(dir, 'userData', 'approved-folders.json'),
      JSON.stringify([project], null, 2),
    );
    const settings = 'WHO=the-stack\nPORT=8321\n';
    writeFileSync(join(folder, 'connections.env'), settings);
    writeFileSync(
      join(folder, 'link.json'),
      JSON.stringify(
        {
          version: 1,
          app: 'link',
          folder: project,
          script: 'greet',
          args: [],
          port: 8321,
          envFile: 'connections.env',
        },
        null,
        2,
      ),
    );

    // Reopen the bench so it reads what is now recorded.
    await page.reload();
    await expect(bench.locator('#folder')).toContainText('a-project', { timeout: 60_000 });
    await expect(bench.locator('#about')).toContainText('2 scripts', { timeout: 30_000 });
    await expect(bench.locator('#script')).toHaveValue('greet');

    // Run it: the settings the Crux holds reach the process.
    await bench.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(bench.locator('#log')).toContainText('greeting from the-stack on 8321', {
      timeout: 120_000,
    });

    // The choice is kept, so it is one press next time.
    await expect
      .poll(() => readFileSync(join(folder, 'link.json'), 'utf8'), {
        timeout: 30_000,
        intervals: [1000],
      })
      .toContain('"script": "greet"');
  } finally {
    await app.close();
  }
});

test('a folder nobody chose is refused, however a Crux asks', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp();
  try {
    const project = join(dir, 'never-chosen');
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify({ name: 'not-yours', scripts: { go: 'node -e "0"' } }, null, 2),
    );

    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Link/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const folder = cruxFolder(dir);

    // A Crux that names a path it was never given — the case this rule exists
    // for. No approvals file is written.
    writeFileSync(
      join(folder, 'link.json'),
      JSON.stringify({ version: 1, app: 'link', folder: project, script: 'go' }, null, 2),
    );
    await page.reload();

    const bench = page.frameLocator('iframe[data-crux-id]');
    await expect(bench.locator('#folder')).toContainText('never-chosen', { timeout: 60_000 });
    await bench.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(bench.locator('#status')).toContainText(/Choose this folder/i, {
      timeout: 60_000,
    });
  } finally {
    await app.close();
  }
});
