import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

async function openInfo(page: Page) {
  const toggle = page.getByRole('button', { name: 'Toggle metadata', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  const info = page.getByRole('region', { name: 'About this tool', exact: true });
  await expect(info).toBeVisible();
  await info.getByRole('button', { name: 'Version, adaptations and licenses' }).click();
  return info;
}

test('Home credits show this Crux’s records and survive complete export/import', async () => {
  test.setTimeout(180000);
  const first = await launchApp();
  const archive = join(first.dir, 'credits.crux');
  const evidence = resolve(__dirname, '../../docs/tool-info');
  mkdirSync(evidence, { recursive: true });
  try {
    const { page } = first;
    await page.setViewportSize({ width: 1600, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Tables/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 45000 });
    const info = await openInfo(page);
    await expect(info).toContainText('custom Garden table editor');
    await expect(info.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/olifolkerd/tabulator',
    );
    await expect(info.getByTestId('tool-info-document')).toContainText('Tabulator 6.5.2');
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const meta = await storedCrux(page, id);
    expect(meta.toolInfo.name).toBe('Tabulator');
    appendFileSync(
      join(meta.projectFolder, 'README.md'),
      '\nLocal adaptation: My studio edition, revision 7.\n',
    );
    await expect(info.getByTestId('tool-info-document')).toContainText(
      'My studio edition, revision 7',
      { timeout: 30000 },
    );
    await info.getByLabel('Tool information and notices').selectOption('shared/LICENSE.md');
    await expect(info.getByTestId('tool-info-document')).toContainText('MIT');
    await info.getByLabel('Tool information and notices').selectOption('README.md');
    await expect(info.getByTestId('tool-info-document')).toContainText(
      'My studio edition, revision 7',
    );
    await page.screenshot({
      path: join(evidence, 'home-tool-credits.png'),
      animations: 'disabled',
    });
    await exportNativeCrux(page, archive);
  } finally {
    await first.app.close();
  }
  const second = await launchApp();
  try {
    await enterGarden(second.page);
    await importNativeCrux(second.page, archive);
    const info = await openInfo(second.page);
    await expect(info.getByTestId('tool-info-document')).toContainText(
      'My studio edition, revision 7',
    );
    await expect(info.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/olifolkerd/tabulator',
    );
  } finally {
    await second.app.close();
  }
});

test('Home exposes the native app pin, adaptations and original notices', async () => {
  test.setTimeout(120000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Bitsy/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 45000 });
    const info = await openInfo(page);
    await expect(info).toContainText('Built with Bitsy');
    await expect(info.getByTestId('tool-info-document')).toContainText('Garden');
    await expect(info.getByTestId('tool-info-document')).toContainText('pinned');
    await info.getByLabel('Tool information and notices').selectOption('LICENSE.md');
    await expect(info.getByTestId('tool-info-document')).toContainText('MIT License');
  } finally {
    await app.close();
  }
});
