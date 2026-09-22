import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('panel discovery mirrors the workspace, supports keyboard search and retains work', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Panel desk');
    const header = page.locator('header');
    await expect(page.getByRole('navigation', { name: 'Workspace breadcrumbs' })).toContainText(
      'Panel desk',
    );
    await expect(header.getByRole('button', { name: 'Toggle history', exact: true })).toHaveCount(
      0,
    );
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('Keep this thought while I rearrange');
    const add = page.getByRole('button', { name: 'Add panel', exact: true });
    await add.click();
    const picker = page.getByRole('dialog', { name: 'Add panel', exact: true });
    const search = picker.getByRole('textbox', { name: 'Find a panel' });
    await expect(search).toBeFocused();
    await expect(
      picker.getByRole('button', { name: 'Toggle collaboration', exact: true }),
    ).toHaveCount(0);
    await search.fill('no such panel');
    await expect(picker.getByRole('status')).toHaveText('No matching panels');
    await search.fill('history');
    await search.press('ArrowDown');
    await expect(picker.getByRole('button', { name: 'Toggle history' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(header.getByRole('button', { name: 'Toggle history' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('pane-body-history')).toBeVisible();
    await header.getByRole('button', { name: 'Toggle history' }).focus();
    await page.keyboard.press('Enter');
    await expect(add).toBeFocused();
    await expect(header.getByRole('button', { name: 'Toggle history' })).toHaveCount(0);
    await add.click();
    await search.press('ArrowUp');
    await expect(picker.getByRole('button', { name: 'Workspace layouts…' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(picker.getByRole('button', { name: 'Toggle artifacts' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(add).toBeFocused();
    await togglePanel(page, 'Toggle collaboration');
    await togglePanel(page, 'Toggle collaboration');
    await expect(composer).toHaveValue('Keep this thought while I rearrange');
    await add.click();
    await picker.getByRole('button', { name: 'Arrange open panels', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(composer).toHaveValue('Keep this thought while I rearrange');
    await add.click();
    await picker.getByRole('button', { name: 'Workspace layouts…', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Workspace layouts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(800, 700));
    await add.click();
    await expect(picker).toBeInViewport({ ratio: 1 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 650));
    await expect(picker).toBeInViewport({ ratio: 1 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(800, 700));
    await expect(picker).toBeInViewport({ ratio: 1 });
    await search.fill('synth');
    await picker.getByRole('button', { name: 'Toggle crux synth' }).click();
    await expect(header.getByRole('button', { name: 'Toggle crux synth' })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByTestId('pane-body-synth')).toBeVisible();
    // Match the native window after Plasma's backing-canvas resize debounce.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('canvas.plasma-ground');
          return (
            !canvas || Math.abs(canvas.width / canvas.height - innerWidth / innerHeight) < 0.01
          );
        }),
      )
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: 'e2e/.results/panel-picker-bar.png' });
    await add.click();
    await expect(search).toBeFocused();
    await expect(picker).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: 'e2e/.results/panel-picker-open.png' });
  } finally {
    await app.close();
  }
});
