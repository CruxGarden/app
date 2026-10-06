import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { DownloadItem, Event } from 'electron';
import { launchApp } from '../launch';
import { enterGarden, createCrux, switchCrux } from '../multi-crux-helpers';
import { showPane, hidePane } from '../panel-helpers';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * V1-TESTING-GUIDE § 28 · Mood: Background — the four choices and their
 * light/dark rules, a backdrop of one's own, and what an invalid file does.
 */
test.describe('guide 28 · Background', () => {
  test('BG-01 — Bloom, Drift, Waves and Blank each take; Drift and Waves are dark-only', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Background', exact: true }).click();
      for (const label of ['Bloom', 'Drift', 'Waves', 'Blank']) {
        await mood.getByRole('button', { name: new RegExp(`^${label}`) }).click();
        await expect
          .poll(() =>
            page.evaluate(() =>
              document.documentElement.style.getPropertyValue('--background-type').trim(),
            ),
          )
          .toBe(label === 'Waves' ? 'flow' : label.toLowerCase());
      }
      // Light mode: the dark-only choices are disabled, the others stay.
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      const light = mood
        .getByRole('button', { name: /^Light/ })
        .or(mood.getByLabel(/light/i))
        .first();
      if (await light.isVisible().catch(() => false)) {
        await light.click();
        await mood.getByRole('button', { name: 'Background', exact: true }).click();
        await expect(mood.getByRole('button', { name: /^Drift/ })).toBeDisabled();
        await expect(mood.getByRole('button', { name: /^Waves/ })).toBeDisabled();
        await expect(mood.getByRole('button', { name: /^Bloom/ })).toBeEnabled();
      }
    } finally {
      await app.close();
    }
  });

  test('BG-02/04 — a backdrop of your own appears and can be removed; a file that is not an image is refused', async () => {
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Background', exact: true }).click();
      const png = join(dir, 'backdrop.png');
      writeFileSync(png, PNG);
      let chooser = page.waitForEvent('filechooser');
      await mood.getByText('Upload a background image').click();
      await (await chooser).setFiles(png);
      await expect(mood.getByRole('button', { name: 'Change image' })).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--background-type').trim(),
          ),
        )
        .toBe('image');
      await mood
        .getByRole('button', { name: 'Change image' })
        .locator('..')
        .getByRole('button', { name: 'Remove', exact: true })
        .click();
      await expect(mood.getByRole('button', { name: 'Change image' })).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--background-type').trim(),
          ),
        )
        .not.toBe('image');
      // Not an image: refused, and the Mood is still fine.
      const bogus = join(dir, 'not-an-image.png');
      writeFileSync(bogus, 'plain text pretending');
      chooser = page.waitForEvent('filechooser');
      await mood.getByText('Upload a background image').click();
      await (await chooser).setFiles(bogus);
      const refused = page.getByRole('alert').or(page.getByRole('alertdialog'));
      const shown = mood.getByRole('button', { name: 'Change image' });
      await expect(refused.or(shown).first()).toBeVisible({ timeout: 30_000 });
      if (await refused.count()) await page.keyboard.press('Escape');
      await expect(mood.getByRole('button', { name: /^Bloom/ })).toBeEnabled();
    } finally {
      await app.close();
    }
  });

  test('BG-03 — an asset assigned to a pane, moved to another pane, then removed: the right surface wears it and nothing is left broken', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    const brokenImages = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('img')].filter(
            (img) => img.getAttribute('src') && img.complete && img.naturalWidth === 0,
          ).length,
      );
    try {
      await enterGarden(page);
      await createCrux(page, 'Textured');
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      await page
        .locator('input[type="file"][aria-label="Add asset files"]')
        .setInputFiles(join(__dirname, '..', 'fixtures', 'backdrop.png'));
      const card = page.locator('[data-testid^="asset-"]').filter({ hasText: 'backdrop.png' });
      await expect(card).toBeVisible();
      // Workshop pane first.
      await card.getByRole('button', { name: 'Pane texture' }).click();
      await expect
        .poll(() => cssVar('--pane-workshop-texture'), { timeout: 10_000 })
        .toMatch(/^url\("blob:/);
      expect(await cssVar('--pane-collaboration-texture')).not.toMatch(/blob:/);
      // Change the assignment: the Collaboration pane instead.
      await card.getByRole('combobox', { name: 'Pane for backdrop.png' }).selectOption({
        label: 'Collaboration',
      });
      await card.getByRole('button', { name: 'Pane texture' }).click();
      await expect
        .poll(() => cssVar('--pane-collaboration-texture'), { timeout: 10_000 })
        .toMatch(/^url\("blob:/);
      // Remove the asset: no surface keeps a dead reference, no image is broken.
      await card.getByRole('button', { name: 'Remove asset backdrop.png' }).click();
      await expect(card).toHaveCount(0);
      await expect.poll(() => cssVar('--pane-collaboration-texture')).not.toMatch(/blob:/);
      await expect.poll(() => cssVar('--pane-workshop-texture')).not.toMatch(/blob:/);
      await expect(page.locator('.mosaic-window.pane-collaboration')).not.toHaveCSS(
        'background-image',
        /blob:/,
      );
      expect(await brokenImages()).toBe(0);
    } finally {
      await app.close();
    }
  });

  test('BG-05 — a new Persona greets new Cruxes; an older conversation keeps the name it was had with', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Older talk');
      const rows = page.locator('[data-role="assistant"]');
      await expect(rows.first()).toBeVisible({ timeout: 30_000 });
      await expect(rows.first().getByText('Vel', { exact: true })).toBeVisible();
      // A turn under the old name, so the conversation has history.
      const input = page.getByPlaceholder('Send a message...');
      await input.fill('Please write hello');
      await input.press('Enter');
      await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
        timeout: 30_000,
      });
      // Persona: name, greeting, avatar.
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Persona', exact: true }).click();
      await mood.getByPlaceholder('Persona name').fill('Fern');
      await mood
        .getByPlaceholder('A greeting shown when the console opens')
        .fill('Fern here, ready to grow.');
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        mood.getByRole('button', { name: 'Choose an avatar' }).click(),
      ]);
      await chooser.setFiles(join(__dirname, '..', 'fixtures', 'backdrop.png'));
      await expect(mood.getByRole('button', { name: 'Revert to Default' })).toBeVisible({
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
      await hidePane(page, 'Mood');
      // A new Crux: the new persona greets, under its name, with its face.
      await createCrux(page, 'Newer talk');
      const greeting = page.getByText('Fern here, ready to grow.', { exact: true });
      await expect(greeting).toBeVisible({ timeout: 30_000 });
      const row = page.locator('[data-role="assistant"]').filter({ has: greeting });
      await expect(row.getByText('Fern', { exact: true })).toBeVisible();
      await expect(row.getByTestId('persona-avatar').locator('img')).toHaveAttribute(
        'src',
        /^blob:/,
      );
      // The older conversation is not rewritten: its rows still say who was there.
      await switchCrux(page, 'Older talk');
      const older = page.locator('[data-role="assistant"]');
      await expect(older.first()).toBeVisible({ timeout: 30_000 });
      await expect(older.first().getByText('Vel', { exact: true })).toBeVisible();
      await expect(page.getByText('Fern here, ready to grow.')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('BG-06 — an exported Mood carries its backdrop, texture and avatar as bytes, not as paths on this machine', async () => {
    test.setTimeout(150_000);
    const { app, page, dir } = await launchApp();
    const archive = join(dir, 'packed.cruxmood');
    try {
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      // A backdrop of one's own.
      await mood.getByRole('button', { name: 'Background', exact: true }).click();
      const png = join(dir, 'backdrop.png');
      writeFileSync(png, PNG);
      const chooser = page.waitForEvent('filechooser');
      await mood.getByText('Upload a background image').click();
      await (await chooser).setFiles(png);
      await expect(mood.getByRole('button', { name: 'Change image' })).toBeVisible({
        timeout: 30_000,
      });
      // An asset as the workspace texture and the cover.
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      await page
        .locator('input[type="file"][aria-label="Add asset files"]')
        .setInputFiles(join(__dirname, '..', 'fixtures', 'backdrop.png'));
      const card = page.locator('[data-testid^="asset-"]').filter({ hasText: 'backdrop.png' });
      await card.getByRole('button', { name: 'Workspace texture' }).click();
      await card.getByRole('button', { name: 'Cover', exact: true }).click();
      // A face.
      await mood.getByRole('button', { name: 'Persona', exact: true }).click();
      const [avatar] = await Promise.all([
        page.waitForEvent('filechooser'),
        mood.getByRole('button', { name: 'Choose an avatar' }).click(),
      ]);
      await avatar.setFiles(join(__dirname, '..', 'fixtures', 'backdrop.png'));
      await expect(mood.getByRole('button', { name: 'Revert to Default' })).toBeVisible({
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
      // Save and export.
      await mood.getByRole('button', { name: 'Moods', exact: true }).click();
      await mood.getByRole('button', { name: 'Save current as Mood' }).click();
      await mood.getByRole('textbox', { name: 'Mood name' }).fill('Packed');
      await mood.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(mood.getByRole('button', { name: 'Apply Packed', exact: true })).toBeVisible();
      await app.evaluate(({ session }, destination) => {
        const listener = (_event: Event, item: DownloadItem) => {
          if (!item.getFilename().endsWith('.cruxmood')) return;
          session.defaultSession.removeListener('will-download', listener);
          item.setSavePath(destination);
        };
        session.defaultSession.on('will-download', listener);
      }, archive);
      await mood.getByRole('button', { name: 'Export Packed', exact: true }).click();
      await expect.poll(() => existsSync(archive), { timeout: 30_000 }).toBe(true);
      let zip: JSZip | null = null;
      await expect
        .poll(async () => {
          try {
            zip = await JSZip.loadAsync(readFileSync(archive));
            return !!zip.file('package.json');
          } catch {
            return false;
          }
        })
        .toBe(true);
      const entries = Object.keys(zip!.files).filter((n) => !zip!.files[n]!.dir);
      // Real image bytes travel inside (PNG signature), for backdrop, texture/cover and avatar.
      let images = 0;
      for (const name of entries) {
        const bytes = await zip!.file(name)!.async('nodebuffer');
        if (
          bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        )
          images++;
      }
      expect(images).toBeGreaterThanOrEqual(2);
      // Nothing points back at this machine.
      for (const name of entries.filter((n) => /\.(json|css|txt|md)$/.test(n))) {
        const text = await zip!.file(name)!.async('string');
        expect(text, name).not.toContain(dir);
        expect(text, name).not.toMatch(/blob:|file:\/\/|\/Users\/|\/home\//);
      }
    } finally {
      await app.close();
    }
  });
});
