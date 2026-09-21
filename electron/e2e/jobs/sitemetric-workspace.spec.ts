import { test, expect } from '@playwright/test';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { home, exportCruxspacePackage } from '../game-cruxspace-helpers';

/**
 * Build the Sitemetric development workspace and export it as a `.cruxspace`
 * (opt-in: `CRUX_BUILD_WORKSPACE=1`).
 *
 * A workspace is assembled once and then handed over — Crux Garden never grows
 * one on its own (ADR 0053). This makes the thing to hand over: a Cruxspace
 * holding a Stack Crux for the infrastructure, a Link Crux per service run
 * from source, and a Runner that conducts them.
 *
 * **Assumptions, stated because the package carries them.** The stack is
 * Postgres and Redis, which is what the platform's services need underneath
 * and what is verified to run here; the platform's own services are not in it,
 * because their Compose file lives in the Sitemetric repository and belongs
 * there. Two Link Cruxes are included, for the shell app and the API, with
 * no folder set — the folder never travels, and each engineer points them at
 * their own checkout. `provides` names the service each stands in for, so
 * dropping a matching service into the Stack later makes the toggle work with
 * no further change.
 */
const OUT = process.env.CRUX_WORKSPACE_OUT ?? resolve(__dirname, '../../../demos/sitemetric');

const STACK = `# The Sitemetric development workspace: what runs underneath.
#
# The platform's own services are not here — their Compose file lives in the
# Sitemetric repository. This is the infrastructure those services need, and
# the place to add anything else the team runs rather than builds.
#
# Every setting is written \${NAME:-default}, so it runs unchanged. What is
# true only on your machine is written by the Runner into .crux/local.env,
# which never leaves it.

services:
  # The database.
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-sitemetric}
      POSTGRES_USER: \${POSTGRES_USER:-sitemetric}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-sitemetric_dev}
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-sitemetric}"]
      interval: 5s
      timeout: 5s
      retries: 5

  # The cache.
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    ports:
      - "\${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
`;

test('build the Sitemetric workspace package', async () => {
  test.skip(process.env.CRUX_BUILD_WORKSPACE !== '1', 'set CRUX_BUILD_WORKSPACE=1 to build it');
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const pkg = join(OUT, 'sitemetric-workspace.cruxspace');

  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);

    const folderOf = async (title: string) => {
      const { readdirSync } = await import('node:fs');
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const garden = join(dir, 'garden');
      const found = readdirSync(garden).find((name) => name.startsWith(slug));
      if (!found) throw new Error(`no folder for ${title}`);
      return join(garden, found);
    };

    const plant = async (tool: RegExp, title: string) => {
      await home(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: tool }).click();
      const name = page.getByLabel('Name', { exact: true });
      if (await name.isVisible().catch(() => false)) await name.fill(title);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
    };

    await test.step('the stack everything runs on', async () => {
      await plant(/^Stack/, 'Sitemetric services');
      writeFileSync(join(await folderOf('Sitemetric services'), 'compose.yaml'), STACK);
    });

    // Each service run from source is a Link Crux. The folder is not set:
    // it never travels, and each engineer chooses their own checkout.
    for (const [title, provides, script] of [
      ['Shell app', 'shell-app', 'start'],
      ['API', 'api', 'start'],
    ] as const) {
      await test.step(`the ${title} from source`, async () => {
        await plant(/^Link/, title);
        writeFileSync(
          join(await folderOf(title), 'link.json'),
          `${JSON.stringify(
            {
              version: 1,
              app: 'link',
              kind: 'node',
              folder: '',
              script,
              args: [],
              port: null,
              provides,
              needs: ['postgres', 'redis'],
              tasks: ['test:e2e'],
            },
            null,
            2,
          )}\n`,
        );
      });
    }

    await test.step('the board that conducts them', async () => {
      await plant(/^Runner/, 'Sitemetric workspace');
    });

    await test.step('one Cruxspace, which is what makes it a workspace', async () => {
      await home(page);
      await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
      await page.getByLabel('Cruxspace name').fill('Sitemetric');
      await page
        .getByLabel('Shared brief')
        .fill(
          'The Sitemetric platform, locally. Open the Runner, point the Link Cruxes at your checkouts, and press Start.',
        );
      for (const name of ['Sitemetric services', 'Shell app', 'API', 'Sitemetric workspace'])
        await page.getByRole('checkbox', { name, exact: true }).check();
      await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
      await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Sitemetric');
    });

    await test.step('the package to hand over', async () => {
      await exportCruxspacePackage(page, app, 'Sitemetric', pkg);
      expect(statSync(pkg).size).toBeGreaterThan(1000);
    });
  } finally {
    await app.close();
  }
});
