import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Starter cruxes: the Feed and Media templates create, the Builder shows their
 * actions, and "Add media" runs a real ffmpeg transcode (WAV → M4A) and writes
 * an item pointing at the converted file. The 5Ws template creates with its
 * Shelf visible in the Builder and "Add to shelf" appends to shelf.json.
 * Does not wait for astro dev.
 */

/** A 0.2 s silent 8 kHz mono 16-bit WAV — small, valid, and not streaming-ready. */
function silentWav(): Buffer {
  const sampleRate = 8000;
  const samples = Math.round(sampleRate * 0.2);
  const dataBytes = samples * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(dataBytes, 40);
  return b;
}

test.describe('starter cruxes', () => {
  test.setTimeout(4 * 60_000);

  test('Feed and Media templates → Builder; Add media transcodes and writes an item', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // ── Feed ──
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Feed/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: /new post/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('button', { name: 'Add images' })).toBeVisible();
      await expect(page.getByText(/set up your feed/)).toHaveCount(1);
      // Add photos → one post per image, pointing at public/images
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      );
      await page
        .getByTestId('add-photos-input')
        .first()
        .setInputFiles([
          { name: 'Harbor Sunset.png', mimeType: 'image/png', buffer: png },
          { name: 'wet-leaves.png', mimeType: 'image/png', buffer: png },
        ]);
      const photosDialog = page.getByRole('alertdialog');
      await expect(photosDialog).toContainText('Added 2 posts', { timeout: 30_000 });
      await photosDialog
        .getByRole('button', { name: /ok|close/i })
        .first()
        .click();
      const feedEditor = page.locator('.monaco-editor').first();
      await expect(feedEditor).toBeVisible({ timeout: 30_000 });
      await expect(feedEditor).toContainText('image: /images/wet-leaves.png');
      await page.screenshot({ path: 'e2e/.results/starters-1-feed-builder.png' });

      // ── Media ──
      // The breadcrumb's first button is the garden name → /home (there is no button named "Home")
      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Media/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      // WorkspaceLayout mounts exactly one layout (mosaic or mobile), so the Builder is in the
      // DOM once; anchor the names because the starter's sample item ("Your first track goes
      // here… Add media") also contains the words.
      const addMedia = page.getByRole('button', { name: /^(\S+ )?Add media$/ });
      await expect(addMedia).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: /^(\S+ )?New item$/i })).toBeVisible();

      // A WAV goes through ffmpeg (bundled ffmpeg-static) and lands as M4A
      await page.getByTestId('add-media-input').first().setInputFiles({
        name: 'Garden Loop.wav',
        mimeType: 'audio/wav',
        buffer: silentWav(),
      });
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toContainText(/Added 1 item \(1 converted for the web\)/, {
        timeout: 90_000,
      });
      await dialog
        .getByRole('button', { name: /ok|close/i })
        .first()
        .click();

      // The item opened in the editor points at the converted file
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await expect(monaco).toContainText('media: /media/Garden-Loop.m4a');
      await expect(monaco).toContainText('kind: audio');
      // …and the converted file is in the project (expand public/ → media/)
      const tree = page.getByRole('tree');
      await tree.getByText('public', { exact: true }).click();
      await tree.getByText('media', { exact: true }).click();
      await expect(tree.getByText('Garden-Loop.m4a')).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: 'e2e/.results/starters-2-media-item.png' });
    } finally {
      await app.close();
    }
  });

  test('5Ws template → Builder shows the Shelf; Add to shelf appends; the files exist', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^5Ws/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // The Builder: the two game actions, the Rounds collection, and the Shelf itself
      await expect(page.getByRole('button', { name: /Add to shelf$/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('button', { name: /Start a round$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^(\S+ )?New round$/i })).toBeVisible();
      const shelf = page.getByTestId('shelf-section');
      await expect(shelf).toContainText('History — Who am I?');
      await expect(shelf).toContainText('Hypatia');
      await expect(shelf).toContainText('Emmy Noether');
      const before = await shelf.getByTestId('shelf-entry').count();
      expect(before).toBeGreaterThanOrEqual(40);
      // The sample round is listed under Rounds
      await expect(page.getByText('Round 1', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/starters-3-5ws-builder.png' });

      // Add to shelf: the form appends an entry to shelf.json and the list re-reads it
      await page.getByRole('button', { name: /Add to shelf$/ }).click();
      await page.getByPlaceholder('Name', { exact: true }).fill('Ibn Khaldun');
      await page.getByPlaceholder(/Aliases/).fill('Ibn Khaldūn, Abd al-Rahman ibn Khaldun');
      await page.getByPlaceholder(/Era/).fill('1332–1406');
      await page
        .getByPlaceholder(/Voice note/)
        .fill('Dry historian of how dynasties rot; deflects into the cycle of civilisations.');
      await page.getByPlaceholder(/Sources/).fill('https://en.wikipedia.org/wiki/Ibn_Khaldun');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(shelf).toContainText('Ibn Khaldun', { timeout: 15_000 });
      await expect(shelf.getByTestId('shelf-entry')).toHaveCount(before + 1);

      // Start a round: the game is the site's own /play page — the Builder opens its
      // source so the Workshop preview shows the round (the island needs the visitor's AI).
      await page.getByRole('button', { name: /Start a round$/ }).click();
      const playEditor = page.locator('.monaco-editor').first();
      await expect(playEditor).toBeVisible({ timeout: 30_000 });
      await expect(playEditor).toContainText('client:only="react"');
      await page.screenshot({ path: 'e2e/.results/starters-4-5ws-play-source.png' });

      // The files are real: shelf.json at the root, the sample round under rounds/
      const tree = page.getByRole('tree');
      await expect(tree.getByText('shelf.json', { exact: true })).toBeVisible();
      // Two folders are named rounds now that src/pages/ is expanded (play.astro sits there): the root one is first
      await tree.getByText('rounds', { exact: true }).first().click();
      await expect(tree.getByText('2026-09-05-1.md')).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: 'e2e/.results/starters-4-5ws-shelf-added.png' });
    } finally {
      await app.close();
    }
  });
});
