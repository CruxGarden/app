import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * The collaborator drives the stack.
 *
 * Daniel: "make sure it's drivable by the agent in either your garden /
 * collaboration". The bench is one hand; this is the other. A message in
 * Collaboration makes the model call `compose_ps`, then `compose_up`, and the
 * containers really start — the whole loop, with the scripted model standing
 * in for the provider (CRUX_AI_MOCK=1).
 *
 * The seeded nursery pulls hundreds of megabytes, so the journey writes a
 * small stack of its own and asserts what Docker itself reports.
 */
function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

function runner(): string | null {
  for (const program of ['docker', 'podman']) {
    try {
      execFileSync(program, ['compose', 'version'], { stdio: 'ignore', timeout: 10_000 });
      return program;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

test('the collaborator sees and starts a stack from Collaboration', async () => {
  test.setTimeout(300_000);
  const program = runner();
  test.skip(!program, 'this machine has no Docker or Podman');

  const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Stack/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const folder = cruxFolder(dir);

    // A stack small enough to start in a test, and one the bench has to read
    // from the file like any other.
    writeFileSync(
      join(folder, 'compose.yaml'),
      `services:
  # Waits quietly so the journey can see it running.
  keeper:
    image: alpine:3
    command: ["sleep", "120"]
`,
    );
    const bench = page.frameLocator('iframe[data-crux-id]');
    await expect(bench.locator('#services')).toContainText('keeper', { timeout: 60_000 });

    // The collaborator's turn: "stack" makes the scripted model ask what is
    // running, and "start" makes it start it.
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('look at this stack and start it');
    await composer.press('Enter');

    // The tool rows say what the collaborator did.
    const chat = page.locator('[data-pane="collaboration"], .chat-panel, main').first();
    await expect(chat.getByText(/compose/i).first()).toBeVisible({ timeout: 60_000 });

    // Docker is the witness, not the chat: the container really exists.
    const containers = () =>
      execFileSync(program!, ['ps', '--format', '{{.Image}} {{.Status}}'], {
        encoding: 'utf8',
        timeout: 20_000,
      });
    await expect
      .poll(() => containers(), { timeout: 180_000, intervals: [2000] })
      .toContain('alpine:3');

    // Put it back: a test must not leave containers on the machine.
    await bench.getByRole('button', { name: 'Stop and remove' }).click();
    await expect
      .poll(() => containers(), { timeout: 120_000, intervals: [2000] })
      .not.toContain('alpine:3');
  } finally {
    await app.close();
  }
});
