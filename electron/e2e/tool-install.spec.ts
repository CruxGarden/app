import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { LOCAL_API, useLocalApi } from './local-api-helpers';

/**
 * Install a Crux Tool from Explore and create from it (CRUX-TOOLS-DISTRIBUTION-PLAN
 * §5). Opt-in: a dev server that behaves like the packaged build
 * (`CRUX_BUNDLE_TOOLS=bundled npx vite --port 8082`), an API on this machine
 * where the tool was published (e2e/jobs/publish-tools.spec.ts), and:
 *
 *   CRUX_DEV_SERVER=http://localhost:8082 CRUX_LOCAL_API=http://localhost:3001 \
 *   CRUX_INSTALL_TOOL=p5-app npx playwright test e2e/tool-install.spec.ts
 */
const TOOL = process.env.CRUX_INSTALL_TOOL;
test.skip(!TOOL || !LOCAL_API, 'set CRUX_INSTALL_TOOL and CRUX_LOCAL_API');

test('a tool not in the build installs from Explore and then creates', async () => {
  test.setTimeout(900000);
  const { app, page, dir } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await useLocalApi(page);
    await page.keyboard.press('Escape');

    // Not installed: the picker says so and offers Explore.
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    for (const template of [
      'notes',
      'astro-homepage',
      'astro-blog',
      'business-page',
      'resume',
      'photo-gallery',
    ]) {
      const bundled = page.locator(`[data-template-id="${template}"]`);
      await expect(bundled).toBeVisible();
      await expect(bundled).not.toContainText('not installed');
    }
    await page.getByRole('checkbox', { name: /Include tools to install/ }).check();
    const row = page.locator(`[data-template-id="${TOOL}"]`);
    await expect(row).toContainText('not installed');
    await row.click();
    await page.getByRole('button', { name: 'Install from Explore' }).click();

    // Explore → Tools → Install.
    const card = page.getByTestId(`explore-tool-${TOOL}`);
    await expect(card).toBeVisible({ timeout: 30000 });
    const packageRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().startsWith(LOCAL_API!) &&
        /\/artifacts(?:\/[^/]+\/download)?(?:\?|$)/.test(new URL(request.url()).pathname)
      )
        packageRequests.push(request.url());
    });
    await card.getByRole('button', { name: 'Install' }).click();
    await expect(card.getByTestId('tool-installed')).toBeVisible({ timeout: 120000 });
    expect(packageRequests).toHaveLength(1);
    expect(packageRequests[0]).toMatch(/\/download$/);
    const installedFiles = await page.evaluate(
      async (tool) =>
        window.electronAPI!.sqlite.all(
          "SELECT artifacts.path FROM artifacts JOIN cruxes ON cruxes.id=artifacts.resource_id WHERE cruxes.kind='tool' AND json_extract(cruxes.meta, '$.template')=?",
          [tool],
        ),
      TOOL!,
    );
    expect(installedFiles).toEqual([{ path: '_crux/tool-package.zip' }]);
    await page.keyboard.press('Escape');

    // Installed: Create works, and the Workshop shows the tool.
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const installedChoice = page.locator('[data-template-id^="installed-"]');
    await expect(installedChoice).not.toContainText('not installed');
    await installedChoice.click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 600000 });
    await expect(page.locator('iframe[data-crux-id]')).toBeVisible({ timeout: 60000 });
    if (TOOL === 'p5-app') {
      const frame = page.frameLocator('iframe[data-crux-id]');
      await expect(frame.locator('#stage canvas')).toBeVisible();
      await frame.locator('#sketch-name').fill('Installed from local Explore');
      await frame.locator('#sketch-name').press('Enter');
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const folder = (await storedCrux(page, id)).projectFolder;
      await expect
        .poll(
          () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).project?.name,
        )
        .toBe('Installed from local Explore');
      await page.screenshot({ path: 'e2e/.results/tool-installed-created.png' });
      await app.close();
      const restarted = await launchApp({ dir });
      try {
        await restarted.page.getByRole('button', { name: /enter/i }).click();
        await expect(
          restarted.page.frameLocator('iframe[data-crux-id]').locator('#sketch-name'),
        ).toHaveValue('Installed from local Explore', { timeout: 60_000 });
        await expect(
          restarted.page.frameLocator('iframe[data-crux-id]').locator('#stage canvas'),
        ).toBeVisible();
      } finally {
        await restarted.app.close();
      }
    } else if (TOOL === 'gdevelop-app') {
      await page.setViewportSize({ width: 2000, height: 1200 });
      await page.getByTitle('Close Tasks', { exact: true }).click();
      await page.getByTitle('Close Collaboration', { exact: true }).click();
      const frame = page.frameLocator('iframe[data-crux-id]');
      await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
        timeout: 180000,
      });
      await frame.locator('#add-new-object-button').click();
      await frame.getByText('3D Box', { exact: true }).click();
      await frame.getByRole('button', { name: 'Apply', exact: true }).click();
      await frame.getByText('New3DBox', { exact: true }).click({ button: 'right' });
      await frame.getByText('Add instance to the scene', { exact: true }).click();
      await frame
        .locator('#garden-project')
        .getByRole('button', { name: 'Save project', exact: true })
        .click();
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const folder = (await storedCrux(page, id)).projectFolder;
      const game = () => {
        const doc = JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
        return JSON.parse(
          readFileSync(join(folder, 'data', doc.project.document.__cruxBinary.path), 'utf8'),
        );
      };
      await expect
        .poll(() =>
          game().layouts[0].instances.some((i: { name: string }) => i.name === 'New3DBox'),
        )
        .toBe(true);
      await page.screenshot({ path: 'e2e/.results/tool-installed-gdevelop.png' });
      await app.close();
      const again = await launchApp({ dir });
      try {
        await again.page.setViewportSize({ width: 2000, height: 1200 });
        await again.page.getByRole('button', { name: /enter/i }).click();
        const reopened = again.page.frameLocator('iframe[data-crux-id]');
        await expect(reopened.locator('#garden-project [role=status]')).toHaveText(
          'Saved to Garden',
          { timeout: 180000 },
        );
        await expect(reopened.getByText('New3DBox', { exact: true }).first()).toBeVisible();
        expect(
          game().layouts[0].instances.some((i: { name: string }) => i.name === 'New3DBox'),
        ).toBe(true);
      } finally {
        await again.app.close();
      }
    } else await page.screenshot({ path: 'e2e/.results/tool-installed-created.png' });
  } finally {
    await app.close().catch(() => {});
  }
});
