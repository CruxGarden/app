import { test } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';

/** Why is an embedded app blank? Dump the frame's URL, its console and its DOM. Opt-in. */
test.skip(!process.env.CRUX_EMBED_PROBE, 'set CRUX_EMBED_PROBE=1');
test('embedded app probe', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  const lines: string[] = [];
  page.on('console', (m) => lines.push(`${m.type()} ${m.location().url} ${m.text().slice(0, 200)}`));
  page.on('requestfailed', (r) => lines.push(`FAILED ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) lines.push(`HTTP ${r.status()} ${r.url()}`); });
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForTimeout(15_000);
    const frame = page.frameLocator('iframe[data-crux-id]');
    const src = await page.locator('iframe[data-crux-id]').getAttribute('src').catch(() => null);
    const html = await frame.locator('body').innerHTML().catch((e) => `ERR ${e.message}`);
    console.log('IFRAME SRC:', src);
    console.log('IFRAME BODY:', String(html).slice(0, 400));
    console.log('EVENTS:\n' + lines.filter((l) => !/favicon/.test(l)).slice(0, 40).join('\n'));
  } finally {
    await app.close();
  }
});
