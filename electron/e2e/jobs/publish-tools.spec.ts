import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { LOCAL_API, LOCAL_API_LOG, useLocalApi, signInLocally } from '../local-api-helpers';

/**
 * The publishing job of CRUX-TOOLS-DISTRIBUTION-PLAN §4: every Crux Tool
 * that is not in the starter set becomes a published Template Crux —
 * `kind: 'tool'`, `meta.template` its id, its built runtime as Artifacts —
 * in the garden the app is pointed at. Run against a dev server that sees
 * every tool (the default when serving) with the runtimes built
 * (`CRUX_BUNDLE_TOOLS=all npm run prebuild`), and the API on this machine:
 *
 *   CRUX_DEV_SERVER=http://localhost:8080 CRUX_LOCAL_API=http://localhost:3001 \
 *   CRUX_LOCAL_API_LOG=<log> CRUX_PUBLISH_TOOLS=all|p5-app,twine-app \
 *   npx playwright test e2e/jobs/publish-tools.spec.ts
 *
 * Tools already in that garden's Explore are skipped, so a rerun does only
 * what is missing; a tool that fails is noted and the run goes on. Against
 * crux.garden the same job publishes as whoever is signed in.
 */
const WANTED = process.env.CRUX_PUBLISH_TOOLS;
test.skip(
  !WANTED || !LOCAL_API || !LOCAL_API_LOG,
  'set CRUX_PUBLISH_TOOLS (all or a comma list of tool ids) with CRUX_LOCAL_API and CRUX_LOCAL_API_LOG',
);

interface Manifest {
  id: string;
  name: string;
  defaultTitle: string;
  bundled?: boolean;
}
function tools(): { manifest: Manifest; folder: string }[] {
  const root = resolve(__dirname, '../../..');
  const out: { manifest: Manifest; folder: string }[] = [];
  for (const entry of readdirSync(root).sort()) {
    if (!entry.endsWith('-crux')) continue;
    const file = join(root, entry, 'crux-tool.json');
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    out.push({ manifest, folder: join(root, entry) });
  }
  return out;
}

async function home(page: Page) {
  if (/\/c\//.test(page.url())) await page.locator('header').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible({
    timeout: 30000,
  });
}

async function publishOne(page: Page, manifest: Manifest) {
  await home(page);
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  await page.locator(`[data-template-id="${manifest.id}"]`).click();
  await page.getByPlaceholder(manifest.defaultTitle || 'My Crux').fill(manifest.name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // A big runtime (GDevelop: 2,647 files) takes minutes to become Artifacts.
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 600000 });
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  // A Template Crux, not a project: the Tool template kind (Metadata pane)
  // publishes it whole, keeps it out of the garden's list and puts it under
  // Explore's Tools. The tool's own editor hooks were registered when the
  // Crux opened as an app, so it is closed and reopened as the package it
  // now is before sharing.
  await page.getByRole('button', { name: 'Toggle metadata' }).click();
  const kindBadge = page.getByRole('button', {
    name: /^(auto|Web App|Page|Document|Image|Tool template)$/i,
  });
  for (let i = 0; i < 8 && !/tool template/i.test((await kindBadge.textContent()) ?? ''); i++)
    await kindBadge.click();
  await expect(kindBadge).toHaveText(/tool template/i);
  await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  await page.getByRole('button', { name: 'Close current workspace' }).click();
  await page.getByRole('button', { name: 'Save and close' }).click();
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.evaluate((id) => {
    window.history.pushState({}, '', `/c/${id}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, id);
  await expect(page.locator(`[data-workspace-id="${id}"]`)).toBeVisible({ timeout: 120000 });
  if (await page.locator('.mosaic-window.pane-details').count()) {
    await page.getByTitle('Close Metadata').click();
    await expect(page.locator('.mosaic-window.pane-details')).toHaveCount(0, { timeout: 10000 });
  }
  await page.getByRole('button', { name: 'Toggle share' }).click();
  // Explore lists what is discoverable; a tool is published to be found.
  const discoverable = page.getByRole('switch', { name: /Discoverable/ });
  if ((await discoverable.getAttribute('aria-checked')) !== 'true') await discoverable.click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const backupAsk = page
    .getByRole('dialog')
    .filter({ hasText: 'A published site is not a backup' });
  if (await backupAsk.isVisible({ timeout: 3000 }).catch(() => false))
    await backupAsk.getByRole('button', { name: 'Share without a backup' }).click();
  await expect(page.getByText('Up to date')).toBeVisible({ timeout: 600000 });
  return id;
}

test('publish the Crux Tools as Template Cruxes', async () => {
  const wanted = WANTED === 'all' ? null : new Set(WANTED!.split(',').map((s) => s.trim()));
  const list = tools().filter(
    ({ manifest, folder }) =>
      (wanted ? wanted.has(manifest.id) : !manifest.bundled) && existsSync(join(folder, 'runtime')),
  );
  test.setTimeout(900000 * Math.max(1, list.length));
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1800, height: 1000 });
    await enterGarden(page);
    await useLocalApi(page);
    await signInLocally(page);
    await page.keyboard.press('Escape');
    // Already in that garden: skip, so a rerun only does what is missing.
    const listed = new Set<string>();
    try {
      const res = await fetch(`${LOCAL_API}/explore?kind=tool&type=cruxes&perPage=100`);
      for (const c of (await res.json()) as { meta?: { template?: string } }[])
        if (c.meta?.template) listed.add(c.meta.template);
    } catch {
      /* an empty garden, or not this API's Explore: publish everything */
    }
    const published: string[] = [];
    const failed: string[] = [];
    for (const { manifest } of list) {
      if (listed.has(manifest.id)) {
        console.log(`already published ${manifest.id}`);
        continue;
      }
      try {
        const id = await publishOne(page, manifest);
        published.push(manifest.id);
        console.log(`published ${manifest.id} as ${id}`);
      } catch (error) {
        failed.push(manifest.id);
        console.log(`FAILED ${manifest.id}: ${(error as Error).message.split('\n')[0]}`);
        await page
          .screenshot({ path: `e2e/.results/publish-failed-${manifest.id}.png` })
          .catch(() => undefined);
        // Back to the garden, whatever state the failure left.
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
          window.history.pushState({}, '', '/home');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible({
          timeout: 30000,
        });
      }
    }
    console.log(
      `done: ${published.length} published, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}`,
    );
    expect(failed, `tools that did not publish: ${failed.join(', ')}`).toEqual([]);
  } finally {
    await app.close();
  }
});
