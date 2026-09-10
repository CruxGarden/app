import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

test('One Big Sky: Mood, offline game, keyboard match, focus pause and preserved sources', async () => {
  test.setTimeout(150000);
  const evidence = resolve(__dirname, '../../docs/onebigsky');
  mkdirSync(evidence, { recursive: true });
  const first = await launchApp();
  let id = '';
  let folder = '';
  try {
    const { page } = first;
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByTestId('bundled-one-big-sky').getByRole('button', { name: 'Apply' }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        ),
      )
      .toBe('#ffd08a');
    await expect(page.getByTestId('mood-background-image')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^One Big Sky/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('One Big Sky arcade');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByRole('heading', { name: 'One Big Sky', exact: true })).toBeVisible();
    // The font is a real binary Artifact and can load without a remote dependency.
    expect(readFileSync(join(folder, 'assets/fonts/Silkscreen-Regular.ttf'))).toEqual(
      readFileSync(resolve(__dirname, '../../onebigsky-crux/assets/fonts/Silkscreen-Regular.ttf')),
    );
    expect(
      await frame.locator('body').evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('16px Silkscreen');
      }),
    ).toBe(true);
    expect(
      await frame.locator('body').evaluate(() => {
        // An iframe needs explicit delegation even though the app origin is trusted.
        navigator.getGamepads();
        return (
          document as Document & { featurePolicy: { allowsFeature(name: string): boolean } }
        ).featurePolicy.allowsFeature('gamepad');
      }),
    ).toBe(true);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(evidence, 'title.png') });
    await frame.locator('#start').click();
    await page.keyboard.press('w');
    await frame.locator('#add-bot').click();
    await frame.locator('[data-action="ready"][data-seat="0"]').click();
    await frame.locator('#launch').click();
    await frame.locator('#mode-ffa').click();
    await frame.locator('#fly').click();
    await expect(frame.locator('#hud')).toBeVisible();
    await expect(frame.locator('#announcement')).toBeHidden({ timeout: 15000 });
    await expect(frame.locator('#players-hud').locator(':scope > *')).toHaveCount(2);
    await page.keyboard.press('w');
    await page.keyboard.press('e');
    await page.keyboard.press('Escape');
    await expect(frame.locator('#pause')).toBeVisible();
    await frame.locator('#resume').click();
    await expect(frame.locator('#pause')).toBeHidden();
    // Clicking Garden moves focus out of the game and pauses without losing the match.
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await expect(frame.locator('#pause')).toBeVisible();
    await expect(frame.locator('#pause-reason')).toContainText('lost focus');
    await page.keyboard.press('Escape');
    await frame.locator('#resume').click();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(evidence, 'match.png') });
    // Ordinary external source changes become Artifacts and can be checkpointed.
    const html = readFileSync(join(folder, 'index.html'), 'utf8').replace(
      'Small riders. Big grudges.',
      'Our own sky arena.',
    );
    writeFileSync(join(folder, 'index.html'), html);
    const fingerprint = createHash('sha256').update(html).digest('hex');
    await expect
      .poll(() =>
        page.evaluate(
          async (id) =>
            (
              (await window.electronAPI!.sqlite.get(
                "SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = 'index.html'",
                [id],
              )) as { fingerprint: string }
            )?.fingerprint,
          id,
        ),
      )
      .toBe(fingerprint);
    const history = page.getByTestId('pane-body-history');
    if (!(await history.isVisible()))
      await page.getByRole('button', { name: 'Toggle history', exact: true }).click();
    await history.getByRole('button', { name: 'Take snapshot', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Our sky arena');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('Our sky arena', { exact: true })).toBeVisible();
  } finally {
    await first.app.close();
  }
  const again = await launchApp({ dir: first.dir });
  try {
    const { page } = again;
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        ),
      )
      .toBe('#ffd08a');
    await expect(page.getByTestId('mood-background-image')).toBeVisible();
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByText('Our own sky arena.', { exact: true })).toBeVisible();
    await expect(frame.locator('#menu')).toBeVisible();
    await expect(frame.locator('#lobby')).toBeHidden();
    expect(readFileSync(join(folder, 'CRUX.md'), 'utf8')).toContain('held in memory');
  } finally {
    await again.app.close();
  }
});
