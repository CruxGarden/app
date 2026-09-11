import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, switchCrux } from './multi-crux-helpers';

async function home(page: Page) {
  if (/\/c\//.test(page.url())) await page.locator('header').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'Create Cruxspace', exact: true })).toBeVisible();
}
async function tool(page: Page, label: string) {
  await home(page);
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  await page.getByRole('button', { name: new RegExp('^' + label) }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible();
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  await expect(page.frameLocator('iframe[data-crux-id]').locator('#save-state')).toHaveText(
    'Saved in this Crux',
  );
  return id;
}

test('Cruxspace connects a website, finished artwork and a tracker, retaining selected bytes through changes and restart', async ({}, info) => {
  test.setTimeout(200000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let website = '',
    websiteFolder = '',
    artwork = '',
    firstOutput = Buffer.alloc(0);
  try {
    const { page } = first;
    await page.setViewportSize({ width: 1600, height: 1100 });
    await enterGarden(page);
    website = await createCrux(page, 'Album website');
    websiteFolder = (await storedCrux(page, website)).projectFolder;
    // An ordinary website made in its Project Folder; the real watcher and
    // static preview must observe the later copy from the UI.
    writeFileSync(
      join(websiteFolder, 'index.html'),
      '<!doctype html><html><body style="background:#142b23;color:#f0e4cd;font:24px sans-serif;padding:48px"><h1>Autumn release</h1><img alt="Album cover" src="assets/cover.png" style="width:480px"><p>Made in our Cruxspace.</p></body></html>',
    );
    artwork = await tool(page, 'OpenMosh effects');
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#canvas')).toHaveAttribute('data-rendered', /\d+/);
    await frame.getByLabel('Output name').fill('Album cover');
    await frame.getByRole('button', { name: 'Save output for Cruxspace' }).click();
    await expect(frame.getByRole('status').filter({ hasText: 'Output ready' })).toHaveText(
      'Output ready in this Crux’s Cruxspaces',
    );
    const artworkFolder = (await storedCrux(page, artwork)).projectFolder;
    const outputName = readdirSync(join(artworkFolder, 'exports')).find((p) => p.endsWith('.png'))!;
    firstOutput = readFileSync(join(artworkFolder, 'exports', outputName));
    expect(firstOutput.length).toBeGreaterThan(1000);
    await tool(page, 'Tables');
    const table = page.frameLocator('iframe[data-crux-id]');
    const taskCell = table.locator('.tabulator-row').first().locator('[tabulator-field="task"]');
    await taskCell.dblclick();
    await taskCell.locator('input').fill('Finish album website');
    await taskCell.locator('input').press('Enter');
    await expect(table.locator('#save-state')).toHaveText('Saved in this Crux');
    await home(page);
    await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
    await page.getByLabel('Cruxspace name').fill('Album release');
    await page
      .getByLabel('Shared brief')
      .fill('Bring the artwork, website and release plan together.');
    for (const name of ['Album website', 'Signal garden', 'Launch board'])
      await page.getByRole('checkbox', { name, exact: true }).check();
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
    await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Album release');
    await expect(page.getByRole('img', { name: 'Album cover', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('cruxspace-hub.png') });
    await page
      .getByRole('region', { name: 'Cruxspaces', exact: true })
      .getByRole('button', { name: 'Open Album website', exact: true })
      .click();
    await page.getByRole('button', { name: 'Cruxspace assets', exact: true }).click();
    await page.getByRole('button', { name: 'Use Album cover', exact: true }).click();
    await page.getByLabel('Image path').fill('assets/cover.png');
    await page.getByRole('button', { name: 'Copy selected version', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied Album cover' })).toContainText(
      'Copied Album cover',
    );
    expect(readFileSync(join(websiteFolder, 'assets/cover.png')).equals(firstOutput)).toBe(true);
    const origins = readdirSync(join(websiteFolder, 'cruxspace-assets'));
    const origin = JSON.parse(
      readFileSync(join(websiteFolder, 'cruxspace-assets', origins[0]!), 'utf8'),
    );
    expect(origin.sourceCruxId).toBe(artwork);
    expect(origin.spaceName).toBe('Album release');
    await page.keyboard.press('Escape');
    await page.getByTestId('preview-refresh').click();
    const image = page
      .frameLocator('iframe[data-crux-id]')
      .getByRole('img', { name: 'Album cover' });
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('cruxspace-website.png') });
    // The mock verifier has a separate landing-page repair script; this
    // journey checks discovery/copy and actual bytes, not that scenario.
    await page.getByRole('switch', { name: 'Check automatically ✓', exact: true }).click();
    await page
      .getByPlaceholder('Send a message...')
      .fill(
        '[cruxspace:cover] Find artwork in this Cruxspace and copy its selected version into the website.',
      );
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      page.getByText('Done — copied the selected Cruxspace artwork.', { exact: true }).first(),
    ).toBeVisible({ timeout: 30000 });
    expect(readFileSync(join(websiteFolder, 'assets/agent-cover.png')).equals(firstOutput)).toBe(
      true,
    );
    const agentOrigin = readdirSync(join(websiteFolder, 'cruxspace-assets'))
      .map((p) => JSON.parse(readFileSync(join(websiteFolder, 'cruxspace-assets', p), 'utf8')))
      .find((o) => o.path === 'assets/agent-cover.png');
    expect(agentOrigin.sourceCruxId).toBe(artwork);
    await switchCrux(page, 'Signal garden');
    const revised = page.frameLocator('iframe[data-crux-id]');
    await revised.getByLabel('Effect', { exact: true }).selectOption('mirror');
    await revised.getByRole('button', { name: 'Add effect', exact: true }).click();
    await revised.getByLabel('Output name').fill('Revised cover');
    await revised.getByRole('button', { name: 'Save output for Cruxspace' }).click();
    await expect(revised.getByRole('status').filter({ hasText: 'Output ready' })).toHaveText(
      'Output ready in this Crux’s Cruxspaces',
    );
    expect(readFileSync(join(websiteFolder, 'assets/cover.png')).equals(firstOutput)).toBe(true);
    await home(page);
    await page.getByRole('button', { name: 'Edit Cruxspace', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Signal garden', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
    await expect(page.getByText('No outputs yet.', { exact: false })).toBeVisible();
    expect(readFileSync(join(websiteFolder, 'assets/cover.png')).equals(firstOutput)).toBe(true);
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    const { page } = second;
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Signal garden',
    );
    await home(page);
    await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Album release');
    await expect(
      page.getByText('Bring the artwork, website and release plan together.', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Cruxspaces', exact: true })
        .getByRole('button', { name: 'Open Signal garden', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('region', { name: 'Cruxspaces', exact: true })
      .getByRole('button', { name: 'Open Album website', exact: true })
      .click();
    await expect
      .poll(() =>
        page
          .frameLocator('iframe[data-crux-id]')
          .getByRole('img', { name: 'Album cover' })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(readFileSync(join(websiteFolder, 'assets/cover.png')).equals(firstOutput)).toBe(true);
    // A deleted member must remain removable from the collection.
    await home(page);
    const tracker = page
      .getByRole('button', { name: 'Open Launch board', exact: true })
      .last()
      .locator('..');
    await tracker.hover();
    await tracker.getByRole('button', { name: 'Crux actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('region', { name: 'Cruxspaces', exact: true })
      .getByRole('button', { name: 'Open Album website', exact: true })
      .click();
    await home(page);
    await page.getByRole('button', { name: 'Edit Cruxspace', exact: true }).click();
    await page.getByRole('checkbox', { name: /^Unavailable Crux/ }).click();
    await expect(page.getByRole('checkbox', { name: /^Unavailable Crux/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Cruxspaces', exact: true })
        .getByText('Unavailable Crux', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await second.app.close();
  }
});
