import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

test('graphics refusal keeps entry and workspace usable without changing the saved surface choice', async () => {
  const { app, page, dir } = await launchApp();
  try {
    // Refuse only the performance-capability probe. Rendering itself remains
    // available, so this catches accidentally starting the expensive material.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
        if (args[0] === 'webgl2' && args[1]?.failIfMajorPerformanceCaveat) return null;
        return original.apply(this, args);
      } as typeof original;
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible();
    await expect(page.locator('.gateway canvas')).toHaveCount(0);
    await enterGarden(page);
    await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'glass');
    await createCrux(page, 'No GPU required');
    await showPane(page, 'Mood');
    await page.getByRole('combobox', { name: 'Surface theme' }).selectOption('plasma');
    await expect(page.getByRole('combobox', { name: 'Surface theme' })).toHaveValue('plasma');
    await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'glass');
    await expect(page.locator('canvas.plasma-ground')).toHaveCount(0);
  } finally {
    await app.close();
  }
  // A new process has the actual hardware again; the saved preference remains.
  const again = await launchApp({ dir });
  try {
    await again.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await showPane(again.page, 'Mood');
    await expect(again.page.getByRole('combobox', { name: 'Surface theme' })).toHaveValue('plasma');
  } finally {
    await again.app.close();
  }
});
