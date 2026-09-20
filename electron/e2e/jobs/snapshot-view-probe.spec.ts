import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, addArtifact } from '../multi-crux-helpers';

/** Under Plasma, does the snapshot view settle and mount its panes? Opt-in. */
test.skip(!process.env.CRUX_SNAPSHOT_PROBE, 'set CRUX_SNAPSHOT_PROBE=1');
test('snapshot view under Plasma', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Settle');
    await addArtifact(page, 'index.html');
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.type('<h1>one</h1>');
    await page.keyboard.press('ControlOrMeta+s');
    if (!(await page.getByTestId('pane-body-history').isVisible().catch(() => false)))
      await page.getByRole('button', { name: 'Toggle history' }).click();
    const history = page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Take snapshot', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('One');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('One', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.type('<h1>two</h1>');
    await page.keyboard.press('ControlOrMeta+s');
    await history.getByText('One', { exact: true }).click();
    await expect(page.getByText(/Viewing snapshot/)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'e2e/.results/snapshot-view.png' });
    const mounted = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="pane-body-"]')).map((el) => ({
        id: el.getAttribute('data-testid'),
        children: el.childElementCount,
        w: Math.round(el.getBoundingClientRect().width),
      })),
    );
    console.log('panes in snapshot view:', JSON.stringify(mounted));
    const back = page.getByRole('button', { name: 'Back', exact: true });
    const box1 = await back.boundingBox();
    await page.waitForTimeout(1000);
    const box2 = await back.boundingBox();
    console.log('Back button box:', JSON.stringify(box1), JSON.stringify(box2));
  } finally {
    await app.close();
  }
});
