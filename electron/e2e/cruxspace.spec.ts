import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, setAutoCheck } from './multi-crux-helpers';

async function home(page: Page) {
  if (/\/c\//.test(page.url())) {
    // From a Crux, its Garden is the last step of the Garden location's ancestry.
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Garden ancestry' })
      .getByRole('button')
      .last()
      .click();
  }
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
}
const work = (page: Page) => page.getByRole('region', { name: 'Garden work', exact: true });
const open = (page: Page, title: string) =>
  page.getByRole('main').getByRole('button', { name: `Open ${title}`, exact: true });
/** Advertise an output the way a Crux Tool does: the file and its descriptor under exports/. */
function advertise(folder: string, id: string, label: string, bytes: Buffer) {
  mkdirSync(join(folder, 'exports'), { recursive: true });
  writeFileSync(join(folder, 'exports', `${id}.png`), bytes);
  writeFileSync(
    join(folder, 'exports', `${id}.asset.json`),
    JSON.stringify({
      version: 1,
      id,
      label,
      path: `exports/${id}.png`,
      fingerprint: createHash('sha256').update(bytes).digest('hex'),
      mimeType: 'image/png',
      size: bytes.length,
      created: new Date().toISOString(),
    }),
  );
}
async function tool(page: Page, label: string) {
  await home(page);
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  await page.getByRole('button', { name: new RegExp('^' + label) }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible();
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  if (label === 'OpenMosh')
    await expect(
      page
        .frameLocator('iframe[data-crux-id]')
        .getByRole('button', { name: 'Single', exact: true }),
    ).toBeVisible({ timeout: 45000 });
  else
    await expect(page.frameLocator('iframe[data-crux-id]').locator('#save-state')).toHaveText(
      'Saved in this Crux',
    );
  return id;
}

test('a Garden connects a website, finished artwork and a tracker, retaining selected bytes through changes and restart', async ({}, info) => {
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
    // A Garden for the release, with what it is for written under its name.
    await expect(page.getByRole('button', { name: 'New Garden', exact: true })).toHaveCount(1);
    await page.screenshot({
      path: resolve(__dirname, '../../docs/storage-retirement/home-actions-after.png'),
    });
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Album release');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Album release',
    );
    await page.getByRole('button', { name: 'Add a Garden brief', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Garden brief', exact: true })
      .fill('Bring the artwork, website and release plan together.');
    await page
      .getByRole('textbox', { name: 'Garden brief', exact: true })
      .press('ControlOrMeta+Enter');
    website = await createCrux(page, 'Album website');
    websiteFolder = (await storedCrux(page, website)).projectFolder;
    // An ordinary website made in its Project Folder; the real watcher and
    // static preview must observe the later copy from the UI.
    writeFileSync(
      join(websiteFolder, 'index.html'),
      '<!doctype html><html><body style="background:#142b23;color:#f0e4cd;font:24px sans-serif;padding:48px"><h1>Autumn release</h1><img alt="Album cover" src="assets/cover.png" style="width:480px"><p>Made in our Cruxspace.</p></body></html>',
    );
    // The artwork advertises a finished output exactly as a Crux Tool does.
    artwork = await createCrux(page, 'Signal garden');
    const artworkFolder = (await storedCrux(page, artwork)).projectFolder;
    firstOutput = readFileSync(resolve(__dirname, '../../tool-cruxes/openmosh/assets/demo.png'));
    advertise(artworkFolder, 'album-cover', 'Album cover', firstOutput);
    expect(firstOutput.length).toBeGreaterThan(1000);
    await tool(page, 'Tables');
    const table = page.frameLocator('iframe[data-crux-id]');
    const taskCell = table.locator('.tabulator-row').first().locator('[tabulator-field="task"]');
    await taskCell.dblclick();
    await taskCell.locator('input').fill('Finish album website');
    await taskCell.locator('input').press('Enter');
    await expect(table.locator('#save-state')).toHaveText('Saved in this Crux');
    await home(page);
    await expect(page.getByRole('button', { name: 'New Garden', exact: true })).toHaveCount(1);
    await expect(work(page).getByRole('img', { name: 'Album cover', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('garden-work.png') });
    await open(page, 'Album website').click();
    await page.getByRole('button', { name: 'Garden outputs', exact: true }).click();
    await page.getByRole('button', { name: 'Use Album cover', exact: true }).click();
    await page.getByLabel('Destination path').fill('assets/cover.png');
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
    await setAutoCheck(page, false);
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
    // A later version of the artwork leaves the copied bytes alone.
    advertise(
      (await storedCrux(page, artwork)).projectFolder,
      'revised-cover',
      'Revised cover',
      Buffer.concat([firstOutput, Buffer.from([0])]),
    );
    expect(readFileSync(join(websiteFolder, 'assets/cover.png')).equals(firstOutput)).toBe(true);
    // Moving the artwork out of the Garden takes its outputs with it; copies stay.
    await home(page);
    const card = open(page, 'Signal garden').locator('..');
    await card.hover();
    await card.getByRole('button', { name: 'Crux actions' }).click();
    await page.getByRole('menuitem', { name: 'Remove from Garden', exact: true }).click();
    await expect(open(page, 'Signal garden')).toHaveCount(0);
    await expect(work(page).getByRole('img')).toHaveCount(0);
    expect(readFileSync(join(websiteFolder, 'assets/cover.png')).equals(firstOutput)).toBe(true);
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    const { page } = second;
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page
      .getByRole('complementary', { name: 'Navigator' })
      .getByRole('button', { name: 'Album release', exact: true })
      .click();
    await expect(
      page.getByText('Bring the artwork, website and release plan together.', { exact: true }),
    ).toBeVisible();
    await expect(open(page, 'Signal garden')).toHaveCount(0);
    await open(page, 'Album website').click();
    await expect
      .poll(() =>
        page
          .frameLocator('iframe[data-crux-id]')
          .getByRole('img', { name: 'Album cover' })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(readFileSync(join(websiteFolder, 'assets/cover.png')).equals(firstOutput)).toBe(true);
    // A deleted Crux simply leaves the Garden.
    await home(page);
    const tracker = open(page, 'Launch board').locator('..');
    await tracker.hover();
    await tracker.getByRole('button', { name: 'Crux actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(open(page, 'Launch board')).toHaveCount(0);
    await expect(open(page, 'Album website')).toBeVisible();
  } finally {
    await second.app.close();
  }
});
