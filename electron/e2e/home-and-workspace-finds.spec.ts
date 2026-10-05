import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import {
  addArtifact,
  createCrux,
  enterGarden,
  goHome,
  storedCrux,
  storedFingerprint,
} from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

/**
 * Expected-feature gaps EF12 and EF13: rename, tag search and name sort on
 * Home; Compare with current in Growth; find in files in Artifacts.
 */
const card = (page: Page, title: string) =>
  page.getByRole('button', { name: `Open ${title}`, exact: true }).locator('..');

const cruxRow = (page: Page, id: string) =>
  page.evaluate(
    async (id) =>
      (await window.electronAPI!.sqlite.get('SELECT title, slug FROM cruxes WHERE id = ?', [
        id,
      ])) as { title: string; slug: string },
    id,
  );

async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false))) await togglePanel(page, toggle);
  await expect(body).toBeVisible({ timeout: 30_000 });
  return body;
}

test('Home: rename from the card keeps the slug, tags are searchable, and cruxes sort by name', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    const zebraId = await createCrux(page, 'Zebra notes');
    // Tag it in Details, the one place tags are edited.
    const details = await ensurePane(page, 'details', 'Toggle details');
    const tagInput = details.getByPlaceholder('add tags...');
    await tagInput.fill('Field Trip');
    await tagInput.press('Enter');
    await expect(details.getByText('field-trip')).toBeVisible();
    const appleId = await createCrux(page, 'apple pie');
    await goHome(page);
    const before = await cruxRow(page, appleId);

    // Rename from the card's menu.
    await card(page, 'apple pie')
      .getByRole('button', { name: 'Crux actions', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename', exact: true });
    await dialog.getByRole('textbox', { name: 'Crux name' }).fill('Mango tart');
    await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open Mango tart', exact: true })).toBeVisible();
    expect(await cruxRow(page, appleId)).toEqual({ title: 'Mango tart', slug: before.slug });

    // It is the Crux's name everywhere, and still is after coming back Home.
    await page.getByRole('button', { name: 'Open Mango tart', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Mango tart',
    );
    await goHome(page);
    await expect(page.getByRole('button', { name: 'Open Mango tart', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open apple pie', exact: true })).toHaveCount(0);

    // Sort by name: A–Z, whatever the case.
    const home = page.getByTestId('pane-body-home');
    await home.getByRole('button', { name: 'Name', exact: true }).click();
    const opens = home.getByRole('button', { name: /^Open / });
    await expect(opens.nth(0)).toHaveAccessibleName('Open Mango tart');
    await expect(opens.nth(1)).toHaveAccessibleName('Open Zebra notes');

    // Search finds a Crux by its tag, as a plain word and as #tag.
    const search = home.getByPlaceholder('Search cruxes...');
    await search.fill('field');
    await expect(page.getByRole('button', { name: 'Open Zebra notes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Mango tart', exact: true })).toHaveCount(0);
    await search.fill('#field-trip');
    await expect(page.getByRole('button', { name: 'Open Zebra notes', exact: true })).toBeVisible();
    // A #tag query looks at tags only: a title word is not a tag.
    await search.fill('#zebra');
    await expect(opens).toHaveCount(0);
    expect((await cruxRow(page, zebraId)).title).toBe('Zebra notes');
  } finally {
    await app.close();
  }
});

test('Growth: Compare with current lists the changed file and shows old and new text', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Compare me');
    const meta = await storedCrux(page, id);
    await addArtifact(page, 'notes.txt');
    const editor = page.locator('.monaco-editor').first();
    const disk = () => readFileSync(join(meta.projectFolder, 'notes.txt'), 'utf8');
    await editor.click();
    await page.keyboard.type('earlierwording');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(disk).toBe('earlierwording');

    const history = await ensurePane(page, 'history', 'Toggle growth');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Demo');
    await history.getByPlaceholder('Label (optional)').press('Enter');
    await expect(history.getByText('Demo', { exact: true })).toBeVisible();
    const versions = await page.evaluate(() =>
      window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE kind = 'snapshot'"),
    );

    // Change one file and add another since the version.
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('currentwording');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(disk).toBe('currentwording');
    writeFileSync(join(meta.projectFolder, 'added.txt'), 'new file');
    await expect.poll(() => storedFingerprint(page, id, 'added.txt')).toBeTruthy();

    await history.getByTestId('growth-compare').click();
    const compare = page.getByRole('dialog', { name: 'Compare with current', exact: true });
    const files = compare.getByRole('navigation', { name: 'Changed files' });
    await expect(files.locator('[data-status="changed"]')).toContainText('notes.txt');
    await expect(files.locator('[data-status="added"]')).toContainText('added.txt');
    await expect(files.locator('[data-status="removed"]')).toHaveCount(0);
    const diff = compare.getByTestId('compare-diff');
    await expect(diff).toContainText('earlierwording', { timeout: 30_000 });
    await expect(diff).toContainText('currentwording');
    await compare.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(compare).toBeHidden();

    // Comparing is read-only: no version was made and the files are untouched.
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE kind = 'snapshot'"),
      ),
    ).toEqual(versions);
    expect(disk()).toBe('currentwording');

    // The same comparison from an Edit history recovery point.
    await history.getByRole('button', { name: 'Edits', exact: true }).click();
    const point = history.getByRole('button', {
      name: /^Compare recovery point \d+ with current$/,
    });
    if (await point.count()) {
      await point.first().click();
      await expect(compare).toBeVisible();
      await compare.getByRole('button', { name: 'Close', exact: true }).click();
    }
  } finally {
    await app.close();
  }
});

test('Artifacts: find in files works with AI Tools off and opens the file at the match', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Haystack');
    const meta = await storedCrux(page, id);
    const poem = join(meta.projectFolder, 'docs', 'poem.txt');
    await addArtifact(page, 'readme.txt');
    // Files arrive in the Project Folder; the watcher brings them in.
    mkdirSync(join(meta.projectFolder, 'docs'), { recursive: true });
    writeFileSync(poem, 'first line\nsecond line\n  a Needle in the hay\nlast line\n');
    writeFileSync(join(meta.projectFolder, 'bytes.bin'), Buffer.from([0, 255, 110, 101]));
    await expect.poll(() => storedFingerprint(page, id, 'docs/poem.txt')).toBeTruthy();
    await expect.poll(() => storedFingerprint(page, id, 'bytes.bin')).toBeTruthy();
    // Look at the other file, so the result has somewhere to take us.
    await page.getByRole('tree').getByText('readme.txt', { exact: true }).click();

    const artifacts = page.getByTestId('pane-body-artifacts');
    const find = artifacts.getByRole('searchbox', { name: 'Find in files' });
    await find.fill('needle');
    const results = artifacts.getByTestId('find-results');
    await expect(results).toContainText('1 match in 1 file');
    await expect(results.locator('[data-find-file="docs/poem.txt"]')).toContainText(
      'a Needle in the hay',
    );
    await expect(results.locator('mark')).toHaveText('Needle');

    // Match case narrows it to nothing, and back.
    await artifacts.getByRole('button', { name: 'Match case', exact: true }).click();
    await expect(artifacts.getByText('No matches for “needle”.')).toBeVisible();
    await artifacts.getByRole('button', { name: 'Match case', exact: true }).click();

    // Open the result: the file, that line, the match selected. Typing replaces it.
    await results.getByRole('button', { name: /Needle in the hay/ }).click();
    await expect(page.locator('.monaco-editor .selected-text').first()).toBeVisible();
    await page.keyboard.type('pin');
    await page.keyboard.press('ControlOrMeta+s');
    await expect
      .poll(() => readFileSync(poem, 'utf8'))
      .toBe('first line\nsecond line\n  a pin in the hay\nlast line\n');

    // Clearing the search brings the tree back.
    await find.fill('');
    await expect(page.getByRole('tree')).toBeVisible();
  } finally {
    await app.close();
  }
});
