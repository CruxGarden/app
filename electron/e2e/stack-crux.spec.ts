import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * A Stack Crux: `compose.yaml` in the folder is the stack, and the bench is
 * built from it — every service, the comment above it as its description, the
 * ports it publishes, what it waits for. The journey covers the three things
 * that matter:
 *
 *   · the page describes a stack it has never seen before, from the file;
 *   · a stack that reaches outside the Crux is refused, with the reason named;
 *   · with a runner present, a real service starts and stops.
 *
 * The seeded nursery stack pulls hundreds of megabytes, so the journey writes
 * a small one of its own.
 */
function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

function hasRunner(): boolean {
  for (const program of ['docker', 'podman']) {
    try {
      execFileSync(program, ['compose', 'version'], { stdio: 'ignore', timeout: 10_000 });
      return true;
    } catch {
      /* try the next one */
    }
  }
  return false;
}

test('a stack crux describes its compose file, refuses what reaches outside, and runs', async () => {
  test.setTimeout(300_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Stack/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const folder = cruxFolder(dir);

    const bench = page.frameLocator('iframe[data-crux-id]');
    await expect(bench.locator('#services')).toBeVisible({ timeout: 30_000 });

    // It ships with the nursery, and the page is built from that file alone.
    await expect(bench.locator('#services')).toContainText('postgres', { timeout: 30_000 });
    await expect(bench.locator('#services')).toContainText('PostgreSQL Database');
    await expect(bench.locator('#services')).toContainText('waits for');
    await expect(bench.locator('#about')).toContainText('4 services in this Crux');

    /** Replace the stack and let the bench re-read it. */
    const useStack = async (yaml: string) => {
      writeFileSync(join(folder, 'compose.yaml'), yaml);
      for (let i = 0; i < 4; i++) {
        await bench.getByRole('button', { name: 'Refresh' }).click({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        const text = await bench
          .locator('#services, #refusals')
          .first()
          .innerText()
          .catch(() => '');
        if (text) return;
      }
    };

    // A stack that reaches outside the Crux is refused, and says why.
    await useStack(`services:
  # Nothing good.
  greedy:
    image: alpine:3
    volumes:
      - /:/host
`);
    await expect(bench.locator('#refusals')).toBeVisible({ timeout: 30_000 });
    await expect(bench.locator('#refusals')).toContainText('outside the Crux');

    // A stack it has never seen, described from the file.
    await useStack(`services:
  # Says hello and stops.
  hello:
    image: hello-world
    restart: "no"
`);
    await expect(bench.locator('#refusals')).toBeHidden({ timeout: 30_000 });
    await expect(bench.locator('#services')).toContainText('hello');
    await expect(bench.locator('#services')).toContainText('Says hello and stops.');
    await expect(bench.locator('#about')).toContainText('1 service in this Crux');

    // The overrides: what this machine does differently, from the page.
    await useStack(`services:
  # Always here.
  core:
    image: alpine:3
    command: ["sleep", "5"]
    ports:
      - "\${CORE_PORT:-8099}:80"

  # Only when you ask for it.
  extra:
    image: alpine:3
    profiles: [extras]
    command: ["sleep", "5"]
`);
    // A service in a profile stays out of the way until it is switched on.
    await expect(bench.locator('#services')).toContainText('core', { timeout: 30_000 });
    await expect(bench.locator('#services')).not.toContainText('extra');
    await bench.locator('input[data-profile="extras"]').check();
    await expect(bench.locator('#services')).toContainText('extra');

    // A setting is written to .env, which Compose reads by itself.
    await expect(bench.locator('th', { hasText: 'CORE_PORT' })).toBeVisible();
    await bench.locator('input[data-setting="CORE_PORT"]').fill('8123');
    await bench.getByRole('button', { name: 'Save settings' }).click();
    await expect
      .poll(
        () => (existsSync(join(folder, '.env')) ? readFileSync(join(folder, '.env'), 'utf8') : ''),
        {
          timeout: 30_000,
          intervals: [1000],
        },
      )
      .toContain('CORE_PORT=8123');

    // Ports: what Compose really resolves — the saved setting, not the default.
    await expect(bench.locator('#ports')).toContainText('Ports', { timeout: 60_000 });
    await expect(bench.locator('input[data-port-service="core"]')).toHaveValue('8123', {
      timeout: 30_000,
    });

    // What a neighbour needs to reach it, derived from the resolved ports.
    await expect(bench.locator('#connections')).toContainText('CORE_PORT=8123', {
      timeout: 60_000,
    });
    await bench.getByRole('button', { name: 'Write connections.env' }).click();
    await expect
      .poll(
        () =>
          existsSync(join(folder, 'connections.env'))
            ? readFileSync(join(folder, 'connections.env'), 'utf8')
            : '',
        { timeout: 30_000, intervals: [1000] },
      )
      .toContain('CORE_PORT=8123');

    // And an override file, which Compose merges over the shared stack.
    await bench.getByRole('button', { name: 'Add an override file' }).click();
    await expect
      .poll(() => existsSync(join(folder, 'compose.override.yaml')), {
        timeout: 30_000,
        intervals: [1000],
      })
      .toBe(true);
    // Both files are read now, and both are checked.
    await expect(bench.locator('#files-note')).toContainText('compose.override.yaml', {
      timeout: 30_000,
    });

    // With a runner on the machine, it really runs.
    test.skip(!hasRunner(), 'this machine has no Docker or Podman');
    await useStack(`services:
  # Says hello and stops.
  hello:
    image: hello-world
    restart: "no"
`);
    await expect(bench.locator('.runner')).toHaveClass(/ok/, { timeout: 30_000 });
    await bench.getByRole('button', { name: 'Start' }).first().click();
    await expect(bench.locator('#output')).toContainText(/hello|Pull|Creat|Network/i, {
      timeout: 180_000,
    });
    // hello-world prints and exits, so the bench should show it as finished.
    await expect
      .poll(
        async () =>
          await bench
            .locator('#services')
            .innerText()
            .catch(() => ''),
        { timeout: 120_000, intervals: [2000] },
      )
      .toMatch(/exited|runs once|running/i);

    await bench.getByRole('button', { name: 'Stop and remove' }).click();
    await expect(bench.locator('#output')).toContainText(/Remov|Network|Container/i, {
      timeout: 120_000,
    });
  } finally {
    await app.close();
  }
});
