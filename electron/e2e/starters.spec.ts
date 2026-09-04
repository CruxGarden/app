import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Starter cruxes: the Feed and Media templates create, the Builder shows their
 * actions, and "Add media" runs a real ffmpeg transcode (WAV → M4A) and writes
 * an item pointing at the converted file. Does not wait for astro dev.
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
      await page.screenshot({ path: 'e2e/.results/starters-1-feed-builder.png' });

      // ── Media ──
      await page
        .getByRole('button', { name: 'Home', exact: true })
        .click()
        .catch(() => {});
      await page.goto(page.url().replace(/\/c\/.*$/, '/home')).catch(() => {});
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Media/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      // The workspace mounts the Builder once per layout; take the first match.
      const addMedia = page.getByRole('button', { name: 'Add media' }).first();
      await expect(addMedia).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: /new item/i }).first()).toBeVisible();

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
});
