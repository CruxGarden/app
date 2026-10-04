import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

test('reading earlier Collaboration stays put during a reply and can return to following it', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Read at my pace');
    const pane = page.getByTestId('pane-body-collaboration');
    const composer = pane.getByPlaceholder('Send a message...');
    await composer.fill('Stream a reading review');
    await composer.press('Enter');
    const reply = pane.locator('[data-streaming="true"]');
    await expect(reply).toContainText('Reading note 20:', { timeout: 30000 });
    const scroller = pane.getByRole('region', { name: 'Collaboration messages', exact: true });
    await scroller.hover();
    await page.mouse.wheel(0, -10000);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeLessThan(10);
    await expect(reply).toContainText('Reading note 35:');
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(10);
    await expect(pane.getByRole('button', { name: 'Latest reply', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('reading-paused.png') });
    await pane.getByRole('button', { name: 'Latest reply', exact: true }).click();
    await expect(scroller).toBeFocused();
    await expect(reply).toContainText('Reading note 45:');
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThan(10);
    await pane.getByTestId('composer').getByRole('button', { name: 'Stop', exact: true }).click();
  } finally {
    await app.close();
  }
});

test('Garden conversation preserves reading position through completion and follows again on request', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const pane = await showPane(page, 'Console');
    const composer = pane.getByPlaceholder('Send a message...');
    await composer.fill('Stream a reading review');
    await composer.press('Enter');
    const scroller = pane.getByRole('region', {
      name: 'Garden conversation messages',
      exact: true,
    });
    await expect(scroller).toContainText('Reading note 20:', { timeout: 30000 });
    await scroller.focus();
    await scroller.press('Home');
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeLessThan(10);
    await expect(scroller).toContainText('Reading note 35:');
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(10);
    await expect(pane.getByRole('button', { name: 'Latest reply', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('reading-paused.png') });
    await expect(scroller).toContainText('Reading note 120:', { timeout: 30000 });
    await expect(pane.getByTestId('keeper-status')).toBeHidden();
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(10);
    await pane.getByRole('button', { name: 'Latest reply', exact: true }).click();
    await expect(scroller).toBeFocused();
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThan(10);
    await expect(pane.getByRole('button', { name: 'Latest reply', exact: true })).toBeHidden();
  } finally {
    await app.close();
  }
});
