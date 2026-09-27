import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome, storedCrux } from '../multi-crux-helpers';
import { showPane, openPanel } from '../panel-helpers';
import { newGarden, goToGarden, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 05 · Gardens, outputs and Walkthrough — nesting and
 * deleting a Garden, and output transfers of every kind. SPACE-01/03/04 are
 * garden-workspace and cruxspace specs; SPACE-06/07 garden-history; SPACE-08
 * garden-import and undertakings.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
/** A tiny (silent) WAV: header only, enough to be a real audio file. */
const WAV = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([36, 0, 0, 0]),
  Buffer.from('WAVEfmt '),
  Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0]),
  Buffer.from('data'),
  Buffer.from([0, 0, 0, 0]),
]);

/** Advertise an output the way a Crux Tool does: the file and its descriptor under exports/. */
function advertise(
  folder: string,
  id: string,
  label: string,
  ext: string,
  mimeType: string,
  bytes: Buffer,
) {
  mkdirSync(join(folder, 'exports'), { recursive: true });
  writeFileSync(join(folder, 'exports', `${id}.${ext}`), bytes);
  writeFileSync(
    join(folder, 'exports', `${id}.asset.json`),
    JSON.stringify({
      version: 1,
      id,
      label,
      path: `exports/${id}.${ext}`,
      fingerprint: createHash('sha256').update(bytes).digest('hex'),
      mimeType,
      size: bytes.length,
      created: new Date().toISOString(),
    }),
  );
}

/** Garden outputs → Use <label> → destination → Copy; returns the dialog. */
async function useOutput(page: Page, label: string, destination: string) {
  await page.getByRole('button', { name: 'Garden outputs', exact: true }).click();
  await page.getByRole('button', { name: `Use ${label}`, exact: true }).click({ timeout: 30_000 });
  await page.getByLabel('Destination path').fill(destination);
  await page.getByRole('button', { name: 'Copy selected version', exact: true }).click();
}

test.describe('guide 05 · Gardens', () => {
  test('SPACE-02 — a Garden nests in another, a Crux moves between them with the Navigator following, and deleting the inner Garden does not lose its Crux', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await newGarden(page, 'Outer');
      await newGarden(page, 'Inner');
      const kept = await createCrux(page, 'Kept');
      await goHome(page);
      const nav = await showPane(page, 'Navigator');
      // The tree: Outer holds Inner holds Kept.
      await expect(nav.getByRole('button', { name: 'Outer', exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Inner', exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Kept', exact: true })).toBeVisible();
      // Move Kept up to Outer: it leaves Inner's Home and the tree follows.
      await goToGarden(page, 'Outer');
      await page.getByRole('button', { name: 'Add existing Crux', exact: true }).click();
      await page.getByRole('button', { name: 'Move Kept to this Garden', exact: true }).click();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Open Kept', exact: true })).toBeVisible();
      await goToGarden(page, 'Inner');
      await expect(page.getByRole('button', { name: 'Open Kept', exact: true })).toHaveCount(0);
      // And back into Inner.
      await page.getByRole('button', { name: 'Add existing Crux', exact: true }).click();
      await page.getByRole('button', { name: 'Move Kept to this Garden', exact: true }).click();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Open Kept', exact: true })).toBeVisible();
      // Delete Inner from Outer's Home, from the card's actions.
      await goToGarden(page, 'Outer');
      const card = page.getByRole('button', { name: 'Open Inner', exact: true });
      await card.locator('..').hover();
      await card.locator('..').getByRole('button', { name: 'Crux actions' }).click();
      const remove = page.getByRole('menuitem', { name: 'Delete', exact: true });
      await expect(
        remove,
        'a Garden card offers no Delete: the guide’s step has no control',
      ).toBeVisible();
      await remove.click();
      const dialog = page.getByRole('dialog').filter({ hasText: /Delete/ });
      await expect(dialog).toBeVisible();
      // Cancel changes nothing.
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(card).toBeVisible();
      await card.locator('..').hover();
      await card.locator('..').getByRole('button', { name: 'Crux actions' }).click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(card).toHaveCount(0);
      // Kept was not deleted with it: still a live Crux, still reachable by name.
      const row = await page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.get('SELECT deleted FROM cruxes WHERE id = ?', [
            id,
          ]) as Promise<{
            deleted: string | null;
          }>,
        kept,
      );
      expect(row?.deleted ?? null).toBeNull();
      // …and still somewhere a person can find it: Outer's Home, the Navigator or the switcher.
      const somewhere = page
        .getByRole('button', { name: 'Open Kept', exact: true })
        .or(nav.getByRole('button', { name: 'Kept', exact: true }));
      await expect(
        somewhere.first(),
        'Kept survives in the database but nowhere in the UI: deleting its Garden orphaned it',
      ).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page.getByRole('button', { name: 'Open another Crux…' }).click();
      await page.getByRole('textbox', { name: 'Find a Crux in your garden' }).fill('Kept');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Kept',
        { timeout: 30_000 },
      );
    } finally {
      await app.close();
    }
  });

  test('SPACE-05 — an image, an audio file and a bundle each land where chosen, a wrong kind of path is explained, and a transfer into a Task stays in the Task', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await newGarden(page, 'Album release');
      const source = await createCrux(page, 'Signal garden');
      const sourceFolder = (await storedCrux(page, source)).projectFolder as string;
      const zip = new JSZip();
      zip.file('README.txt', 'a bundle of things');
      const ZIP = await zip.generateAsync({ type: 'nodebuffer' });
      advertise(sourceFolder, 'cover', 'Cover', 'png', 'image/png', PNG);
      advertise(sourceFolder, 'loop', 'Loop', 'wav', 'audio/wav', WAV);
      advertise(sourceFolder, 'pack', 'Pack', 'zip', 'application/zip', ZIP);
      const site = await createCrux(page, 'Album website');
      const siteFolder = (await storedCrux(page, site)).projectFolder as string;
      // Garden outputs is a Workshop control: give the site a page so the Workshop is open.
      await writeFirstFile(page, 'index.html', '<h1>Autumn release</h1>');
      await goHome(page);
      // All three outputs are on Garden Home by themselves.
      const work = page.getByRole('region', { name: 'Garden work', exact: true });
      await expect(work.getByRole('img', { name: 'Cover', exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(work.getByText('Loop', { exact: true })).toBeVisible();
      await expect(work.getByText('Pack', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Open Album website', exact: true }).click();

      // Audio: a picture's path is refused with an example; the right path copies the bytes.
      await useOutput(page, 'Loop', 'assets/loop.png');
      await expect(page.getByRole('alert').filter({ hasText: 'audio path' })).toBeVisible();
      expect(existsSync(join(siteFolder, 'assets/loop.png'))).toBe(false);
      await page.getByLabel('Destination path').fill('assets/loop.wav');
      await page.getByRole('button', { name: 'Copy selected version', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Copied Loop' })).toBeVisible();
      expect(readFileSync(join(siteFolder, 'assets/loop.wav')).equals(WAV)).toBe(true);
      await page.keyboard.press('Escape');
      // A bundle.
      await useOutput(page, 'Pack', 'assets/pack.zip');
      await expect(page.getByRole('status').filter({ hasText: 'Copied Pack' })).toBeVisible();
      expect(readFileSync(join(siteFolder, 'assets/pack.zip')).equals(ZIP)).toBe(true);
      await page.keyboard.press('Escape');

      // Into a Task: the copy is the Task's, not Main's.
      await page.getByRole('button', { name: 'New task', exact: true }).click();
      await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Artwork');
      await page.getByRole('button', { name: 'Save and start task' }).click();
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
      const task = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const taskFolder = (
        (await page.evaluate(
          (id) =>
            window.electronAPI!.sqlite.get(
              'SELECT project_folder FROM working_copies WHERE id = ?',
              [id],
            ),
          task,
        )) as { project_folder: string }
      ).project_folder;
      await openPanel(page, 'workshop', 'Toggle workshop');
      await useOutput(page, 'Cover', 'assets/cover.png');
      await expect(page.getByRole('status').filter({ hasText: 'Copied Cover' })).toBeVisible();
      expect(readFileSync(join(taskFolder, 'assets/cover.png')).equals(PNG)).toBe(true);
      expect(existsSync(join(siteFolder, 'assets/cover.png'))).toBe(false);
    } finally {
      await app.close();
    }
  });
});
