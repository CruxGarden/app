import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

/**
 * Liquid glass (ADR 0043): a person's switch over any Mood. System follows the
 * Mood's surfaceStyle — every bundled Mood, the Default first, wears glass —
 * Off keeps the Mood solid, On puts glass back. Under glass the pane bodies are
 * frosted (backdrop blur), the light orbs drift behind them at normal
 * intensity and stand still at subtle, and menus are liquid-glass-react
 * surfaces. Screenshots of the Default Mood go to docs/moods/.
 */
test('the glass switch: system follows the Mood, off is solid, on is glass; light and menus follow', async () => {
  const { app, page } = await launchApp();
  const evidence = resolve(__dirname, '../../docs/moods');
  const style = () => page.evaluate(() => document.documentElement.dataset.surfaceStyle);
  const bodyFilter = () =>
    page
      .locator('.mosaic-window.pane-collaboration > .mosaic-window-body')
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter');
      });
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(evidence, 'default-gateway.png') });
    await enterGarden(page);
    // The Default Mood wears glass
    await expect.poll(style).toBe('glass');
    await expect(page.getByTestId('liquid-light')).toHaveCount(1);
    await page.screenshot({ path: join(evidence, 'default-home.png') });

    const id = await createCrux(page, 'Glass look');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    writeFileSync(
      join(folder, 'index.html'),
      '<!doctype html><html><body style="font:20px sans-serif;padding:40px;background:#fff"><h1>Glass look</h1><p>A page behind the glass.</p></body></html>',
    );
    await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    await page.getByRole('button', { name: 'Toggle history' }).click();
    await page.waitForTimeout(1200);
    expect(await bodyFilter()).toContain('blur');
    await page.screenshot({ path: join(evidence, 'default-crux.png') });

    // Menus are liquid glass surfaces (liquid-glass-react)
    await page.getByRole('button', { name: /Claude|Model|GPT|Sonnet/ }).first().click();
    await expect(page.locator('.glass-surface [data-glass-role="dropdown"]')).toHaveCount(1);
    await page.keyboard.press('Escape');

    // Off: the Mood as designed, no frost, no light
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const glass = page.getByRole('combobox', { name: 'Liquid glass' });
    await expect(glass).toHaveValue('system');
    await glass.selectOption('off');
    await expect.poll(style).toBe('solid');
    await expect(page.getByTestId('liquid-light')).toHaveCount(0);
    expect(await bodyFilter()).toBe('none');
    await page.screenshot({ path: join(evidence, 'default-solid.png') });

    // On: glass again; subtle intensity keeps the light still
    await glass.selectOption('on');
    await expect.poll(style).toBe('glass');
    await expect(page.getByTestId('liquid-light')).toHaveCount(1);
    const orbAnimation = () =>
      page.locator('.liquid-orb').first().evaluate((el) => getComputedStyle(el).animationName);
    expect(await orbAnimation()).toBe('liquid-drift-1');
    await page.getByRole('combobox', { name: 'Motion intensity' }).selectOption('subtle');
    await expect.poll(orbAnimation).toBe('none');
    await page.getByRole('combobox', { name: 'Motion intensity' }).selectOption('system');
    await page.screenshot({ path: join(evidence, 'default-mood-modal.png') });
  } finally {
    await app.close();
  }
});
