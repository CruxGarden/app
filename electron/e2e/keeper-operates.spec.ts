import { test, expect } from '@playwright/test';
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

/**
 * The Keeper reads and operates the garden (GARDENS-ALL-THE-WAY-OUT step
 * zero: "the app's own controls as tools for the Keeper, the garden's
 * Cruxes as its context"): look at the screen, list the templates, search
 * the garden, read a file, choose a crux's collaborator, export the crux
 * with its history. While it works with the console closed, the top bar
 * shows the hands moving, with Stop.
 */
test('the Keeper looks, searches, reads, chooses a collaborator and exports', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  // The Keeper's trail: every tool result logs as [garden-tool].
  const trail: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[garden-tool]')) trail.push(m.text());
  });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Tour stop');
    // The page, written into the folder as any editor would; the watcher brings it in.
    const garden = join(dir, 'garden');
    const folder = join(garden, readdirSync(garden)[0]!);
    writeFileSync(join(folder, 'index.html'), '<h1>Tour stop</h1>\n<p>Every gate locked.</p>\n');
    await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    await expect(page.getByRole('tree').getByText('index.html', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.keyboard.press('ControlOrMeta+,');
    await page.locator('h2', { hasText: /^AI$/ }).click();
    await page.getByRole('switch', { name: 'Enable AI Tools' }).click();
    const key = page.getByPlaceholder('sk-ant-...');
    await key.fill('sk-ant-e2e-not-a-real-key');
    await key.press('Enter');
    await expect(page.getByPlaceholder('sk-ant-...')).toHaveCount(0, { timeout: 15_000 });
    await page.keyboard.press('Escape');
    const console_ = page.locator('[data-modal-open]', { hasText: 'Console — The Keeper' });
    for (let i = 0; i < 6 && !(await console_.isVisible().catch(() => false)); i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    await expect(console_).toBeVisible({ timeout: 10_000 });
    const composer = console_.getByPlaceholder('Send a message...');
    await composer.fill('[garden:operate] Look around and get Tour stop ready.');
    await composer.press('Enter');
    await expect(console_.getByText('chose Claude Sonnet 5 for Tour stop')).toBeVisible({
      timeout: 60_000,
    });
    await expect(console_.getByText('Used 6 tools')).toBeVisible();

    // The crux's collaborator changed, and the export was handed over.
    const log = trail.join('\n');
    expect(log).toContain('[garden-tool] choose_collaborator');
    // The garden as context: the search cites the crux, the read returns the page.
    expect(log).toMatch(/\[garden-tool\] search_garden ## "Tour stop"/);
    expect(log).toContain('[garden-tool] read_garden_file <h1>Tour stop</h1>');
    await expect
      .poll(async () => (await storedCrux(page, id)).settings?.model, { timeout: 10_000 })
      .toBe('claude-sonnet-5');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pane-toolbar-label', { hasText: 'Collaboration' })).toBeVisible();
    await expect(page.getByTestId('pane-body-collaboration')).toContainText('Claude Sonnet 5');

    // The hands, visible while the console is closed: a chip with Stop.
    await page.keyboard.press('Escape');
    await expect(console_).toBeVisible({ timeout: 10_000 });
    await composer.fill('[garden:tour] Again, slowly.');
    await composer.press('Enter');
    const chip = page.getByTestId('keeper-activity');
    await expect(chip).toBeVisible({ timeout: 30_000 });
    await expect(chip.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.screenshot({ path: 'e2e/.results/keeper-operates.png' });
  } finally {
    console.log(trail.join('\n'));
    await app.close();
  }
});
