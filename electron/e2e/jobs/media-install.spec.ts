import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';

/**
 * Installing ImageMagick for the person (opt-in: `CRUX_MEDIA_INSTALL=1`).
 *
 * ImageMagick is the one media tool the app does not carry, so the bench
 * offers to fetch it. What that means differs by platform — an official
 * download on Linux and Windows, Homebrew on macOS — and on a machine that
 * already has it there is nothing to prove, so this journey is opt-in and
 * skips itself when the answer would be meaningless.
 *
 * It is slow (a download, or minutes of Homebrew), which is the other reason
 * it is not in the default suite.
 */
function hasImageMagick(): boolean {
  try {
    execFileSync('magick', ['--version'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

test('the bench installs ImageMagick when this machine has none', async () => {
  test.skip(process.env.CRUX_MEDIA_INSTALL !== '1', 'set CRUX_MEDIA_INSTALL=1 to run this');
  test.skip(hasImageMagick(), 'this machine already has ImageMagick');
  test.setTimeout(900_000);

  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Media Tools/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();

    const bench = page.frameLocator('iframe[data-crux-id]');
    const chip = bench.locator('.tool-chip').filter({ hasText: 'ImageMagick' });
    await expect(chip).toHaveClass(/missing/, { timeout: 30_000 });

    // The offer only appears where the app knows a way to do it.
    const install = chip.getByRole('button', { name: 'Install' });
    await expect(install).toBeVisible();
    await install.click();

    // Either it is installed, or the app says plainly what the person can run.
    await expect(bench.locator('#output')).toContainText(
      /installed|Homebrew|could not|did not finish/i,
      { timeout: 900_000 },
    );
    const said = await bench.locator('#output').innerText();

    if (/is installed/i.test(said)) {
      // It is where the app puts what it installs, and the chip says so.
      const at = join(dir, 'tools', `${process.platform}-${process.arch}`);
      expect(existsSync(at) || hasImageMagick()).toBe(true);
      await expect(chip).toHaveClass(/ok/, { timeout: 60_000 });
    } else {
      // An honest refusal names the command rather than pretending.
      expect(said).toMatch(/brew install imagemagick|imagemagick\.org|brew\.sh/i);
      await expect(chip).toHaveClass(/missing/);
    }
  } finally {
    await app.close();
  }
});
