import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('tool references make a smaller archive and restore an editable Calendar in a fresh garden', async () => {
  test.setTimeout(240_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const reference = join(first.dir, 'reference.crux');
  const included = join(first.dir, 'included.crux');
  const evidence = resolve(__dirname, '../../docs/runtime-exports');
  mkdirSync(evidence, { recursive: true });
  try {
    const { page, app } = first;
    await page.setViewportSize({ width: 1500, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Calendar/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 120_000,
    });
    const from = (await frame.locator('.ec-day').nth(9).boundingBox())!;
    const to = (await frame.locator('.ec-day').nth(10).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(frame.locator('#event-dialog')).toBeVisible();
    await frame.locator('[name=title]').fill('Creative afternoon');
    await frame.locator('#event-save').click();
    await expect(frame.locator('.ec-event')).toContainText('Creative afternoon');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await exportNativeCrux(page, reference, app, undefined, 'reference');
    const zip = await JSZip.loadAsync(readFileSync(reference));
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    expect(manifest.version).toBe('3.0');
    expect(manifest.runtimeReferences.length).toBeGreaterThan(0);
    for (const ref of manifest.runtimeReferences) {
      expect(ref.tool).toBe('eventcalendar-app');
      expect(zip.file(`artifacts/${ref.fingerprint}`)).toBeNull();
      expect(ref.path).not.toMatch(/^data\//);
    }
    await exportNativeCrux(page, included, app, async () => {}, 'included');
    const full = await JSZip.loadAsync(readFileSync(included));
    expect(
      JSON.parse(await full.file('manifest.json')!.async('text')).runtimeReferences,
    ).toBeUndefined();
    expect(readFileSync(reference).length).toBeLessThan(readFileSync(included).length);
    await page.screenshot({ path: join(evidence, 'export-options.png') });
    await page.reload();
    await page.getByRole('button', { name: 'Export complete Crux', exact: true }).click();
    await expect(page.getByRole('radio', { name: /^Include tools/ })).toBeChecked();
    console.log('Archive sizes', {
      reference: readFileSync(reference).length,
      included: readFileSync(included).length,
    });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(second.page);
    await importNativeCrux(second.page, reference);
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 120_000,
    });
    await expect(frame.locator('.ec-event')).toContainText('Creative afternoon');
    await frame.locator('.ec-event').click();
    await frame.locator('[name=title]').fill('Still editable');
    await frame.locator('#event-save').click();
    await expect(frame.locator('.ec-event')).toContainText('Still editable');
    await second.page.screenshot({ path: join(evidence, 'imported-calendar.png') });
  } finally {
    await second.app.close();
  }
});
