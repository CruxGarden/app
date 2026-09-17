import { expect, type Page, type FrameLocator, type ElectronApplication } from '@playwright/test';
import type { DownloadItem, Event } from 'electron';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { storedCrux } from './multi-crux-helpers';

/** Shared steps of the Glow Garden journey (GAME-CRUXSPACE-PLAN.md §7). */

export async function home(page: Page) {
  if (/\/c\//.test(page.url())) await page.locator('header').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'Create Cruxspace', exact: true })).toBeVisible();
}

export const frame = (page: Page): FrameLocator => page.frameLocator('iframe[data-crux-id]');

/** Wait for a native app's Garden bar to report the saved state. */
export async function nativeReady(page: Page, timeout = 180000) {
  await expect(frame(page).locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
    timeout,
  });
  return frame(page);
}

/** Create a member from the Add Crux menu with a fixed title; returns id and Project Folder. */
export async function member(page: Page, menu: RegExp, title: string, creationTimeout = 60000) {
  await home(page);
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  await page.getByRole('button', { name: menu }).click();
  const name = page.getByLabel('Name', { exact: true });
  if (await name.count()) await name.fill(title);
  else await page.getByPlaceholder('My Crux').fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: creationTimeout });
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const folder = (await storedCrux(page, id)).projectFolder as string;
  return { id, folder, title };
}

/** Open a member from the Cruxspace hub on the Home Garden. */
export async function open(page: Page, title: string) {
  await home(page);
  await page
    .getByRole('region', { name: 'Cruxspaces', exact: true })
    .getByRole('button', { name: `Open ${title}`, exact: true })
    .click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
}

/** A Task workspace opens with Collaboration only; the embedded app needs the Workshop. */
export async function openWorkshop(page: Page) {
  const toggle = page.getByRole('button', { name: 'Toggle workshop' });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.locator('iframe[data-crux-id]')).toBeVisible({ timeout: 60000 });
}

async function collaboration(page: Page, on: boolean) {
  const toggle = page.getByRole('button', { name: 'Toggle collaboration' });
  if (((await toggle.getAttribute('aria-pressed')) === 'true') !== on) await toggle.click();
}

/** Send one scripted collaborator turn and wait for its closing sentence. */
export async function collaborator(page: Page, message: string, closing: string) {
  await collaboration(page, true);
  const box = page.getByPlaceholder('Send a message...');
  await box.fill(message);
  await box.press('Enter');
  await expect(page.getByText(closing, { exact: true }).first()).toBeVisible({ timeout: 150000 });
}

/** Label a Growth checkpoint of the open Working Copy from the history pane. */
export async function snapshot(page: Page, label: string) {
  await collaboration(page, false);
  const pane = page.getByTestId('pane-body-history');
  // A workspace that just switched (after a merge) can re-render its layout under the first click.
  for (let attempt = 0; attempt < 3 && !(await pane.isVisible()); attempt++) {
    await page.getByRole('button', { name: 'Toggle history' }).click();
    await pane.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  }
  await expect(pane).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Take snapshot', exact: true })).toBeEnabled({
    timeout: 120000,
  });
  await pane.getByRole('button', { name: 'Take snapshot', exact: true }).click();
  await pane.getByPlaceholder('Label (optional)').fill(label);
  await pane.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pane.getByText(label, { exact: true })).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Take snapshot', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Toggle history' }).click();
}

/** Output descriptors a member advertises (exports/*.asset.json). */
export function outputs(folder: string): { label: string; path: string; mimeType: string }[] {
  const dir = join(folder, 'exports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.asset.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

export function nativeRecord(folder: string, key: string) {
  const doc = JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const ref = doc.project?.[key]?.__cruxBinary;
  return ref ? JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8')) : null;
}

export function kanBoards(folder: string): any[] {
  const doc = JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  return Object.keys(doc.project ?? {})
    .filter((key) => key.startsWith('record-["kan","board"'))
    .map((key) => nativeRecord(folder, key));
}

export function tone(seconds = 0.5, hz = 880) {
  const rate = 48000;
  const frames = Math.round(rate * seconds);
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    bytes.writeInt16LE(
      Math.round(Math.sin((i * hz * Math.PI * 2) / rate) * 12000 * (1 - i / frames)),
      44 + i * 2,
    );
  return bytes;
}

/** Import an image into the open Piskel through its native wizard (sheet when a frame size is given). */
export async function importPiskelArt(
  page: Page,
  frame: FrameLocator,
  path: string,
  frameSize?: { width: number; height: number },
) {
  // Replacing the sprite asks through window.confirm, which Playwright would otherwise dismiss.
  const accept = (dialog: { accept(): Promise<void> }) => void dialog.accept();
  page.on('dialog', accept);
  await frame.locator('[data-setting=import]').click();
  await frame.locator('input[name=file-upload-input]').setInputFiles(path);
  const wizard = frame.locator('.import-wizard-container');
  await expect(wizard).toBeVisible();
  if (frameSize) {
    await wizard.locator('[name=import-type][value=sheet]').check();
    await wizard.locator('[name=frame-size-x]').fill(String(frameSize.width));
    await wizard.locator('[name=frame-size-y]').fill(String(frameSize.height));
  }
  // The image loads asynchronously into the wizard; click import only once it is shown.
  await expect(wizard.locator('.import-image-file-name')).toContainText(path.split('/').pop()!, {
    timeout: 30000,
  });
  const replace = wizard.locator('.import-mode-replace-button').filter({ visible: true }).first();
  for (let attempt = 0; attempt < 4 && (await wizard.isVisible()); attempt++) {
    // Piskel's canvas overlay can sit above the dialog at large viewports; the buttons are plain click listeners.
    await wizard
      .locator('.import-next-button')
      .filter({ visible: true })
      .first()
      .dispatchEvent('click');
    // An empty sprite is replaced at once; otherwise the wizard asks Combine or Replace.
    await Promise.race([
      replace.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      wizard.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {}),
    ]);
    if ((await wizard.isVisible()) && (await replace.isVisible())) {
      await replace.dispatchEvent('click');
      break;
    }
  }
  await expect(wizard).toBeHidden({ timeout: 30000 });
  page.off('dialog', accept);
}

/** Export the selected Cruxspace from the hub; Chromium streams the package to `destination`. */
export async function exportCruxspacePackage(
  page: Page,
  app: ElectronApplication,
  name: string,
  destination: string,
) {
  await home(page);
  await page
    .getByRole('combobox', { name: 'Cruxspace', exact: true })
    .selectOption({ label: name });
  await app.evaluate(({ session }, path) => {
    const state = globalThis as unknown as { __packageDownload?: string };
    state.__packageDownload = undefined;
    const listener = (_event: Event, item: DownloadItem) => {
      if (!item.getFilename().endsWith('.cruxspace')) return;
      session.defaultSession.removeListener('will-download', listener);
      item.setSavePath(path);
      item.once('done', (_event, result) => {
        state.__packageDownload = result;
      });
    };
    session.defaultSession.on('will-download', listener);
  }, destination);
  await page.getByRole('button', { name: 'Export Cruxspace', exact: true }).click();
  // Other status lines share the page (Tending's count, the Cruxspaces hint): match the export's own.
  await expect(
    page.getByRole('status').filter({ hasText: /Exported .*\.cruxspace/ }),
  ).toContainText(/^Exported .*\.cruxspace with \d+ member Cruxes\.$/, {
    timeout: 10 * 60_000,
  });
  await expect
    .poll(
      () =>
        app.evaluate(
          () => (globalThis as unknown as { __packageDownload?: string }).__packageDownload,
        ),
      { timeout: 180000 },
    )
    .toBe('completed');
}

/** Import a `.cruxspace` package from the hub and wait for the space to be recorded. */
export async function importCruxspacePackage(page: Page, path: string) {
  await home(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import Cruxspace', exact: true }).click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByRole('status')).toContainText(/^Imported .* with \d+ member Cruxes\.$/, {
    timeout: 10 * 60_000,
  });
}
