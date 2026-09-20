import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
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
  test.setTimeout(180000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await useLocalApi(page);
    await page.keyboard.press('Escape');

    // Not installed: the picker says so and offers Explore.
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const row = page.locator(`[data-template-id="${TOOL}"]`);
    await expect(row).toContainText('not installed');
    await row.click();
    await page.getByRole('button', { name: 'Install from Explore' }).click();

    // Explore → Tools → Install.
    const card = page.getByTestId(`explore-tool-${TOOL}`);
    await expect(card).toBeVisible({ timeout: 30000 });
    await card.getByRole('button', { name: 'Install' }).click();
    await expect(card.getByTestId('tool-installed')).toBeVisible({ timeout: 120000 });
    await page.keyboard.press('Escape');

    // Installed: Create works, and the Workshop shows the tool.
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await expect(page.locator(`[data-template-id="${TOOL}"]`)).not.toContainText('not installed');
    await page.locator(`[data-template-id="${TOOL}"]`).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('iframe[data-crux-id]')).toBeVisible({ timeout: 60000 });
    await page.screenshot({ path: 'e2e/.results/tool-installed-created.png' });
  } finally {
    await app.close();
  }
});
