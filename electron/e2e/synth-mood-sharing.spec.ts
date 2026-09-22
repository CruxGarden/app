import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import type { DownloadItem, Event } from 'electron';
import type { SynthPatch } from '../../src/audio/synth-patch';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

const audio = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __cruxAudio: { state(): { synth: SynthPatch; playing: boolean; level: number } };
      }
    ).__cruxAudio.state(),
  );

test('a custom Synth preset travels in a Mood to a clean garden, survives restart and plays', async () => {
  test.setTimeout(120000);
  const first = await launchApp({ sound: true });
  const archive = join(first.dir, 'shared-atmosphere.cruxmood');
  let expected: SynthPatch;
  try {
    await enterGarden(first.page);
    await first.page.getByRole('button', { name: 'Mood', exact: true }).click();
    await first.page.getByRole('button', { name: 'Sound', exact: true }).click();
    const synth = first.page.getByRole('region', { name: 'Crux Synth', exact: true });
    await synth.getByRole('combobox', { name: 'Synth preset', exact: true }).selectOption('dusk');
    await synth.getByRole('slider', { name: 'Synth tempo' }).fill('43');
    await synth.getByRole('slider', { name: 'Synth space' }).fill('0.91');
    await synth.locator('summary').click();
    await synth.getByRole('textbox', { name: 'Synth preset name' }).fill('Between rooms');
    await synth.getByRole('button', { name: 'Save sound preset', exact: true }).click();
    await synth.getByRole('button', { name: 'Load sound Between rooms', exact: true }).click();
    expected = (await audio(first.page)).synth;
    await first.page.getByRole('button', { name: 'Moods', exact: true }).click();
    await first.page.getByRole('button', { name: 'Save current as Mood' }).click();
    await first.page.getByRole('textbox', { name: 'Mood name' }).fill('Shared atmosphere');
    await first.page.getByRole('button', { name: 'Save', exact: true }).click();
    await first.app.evaluate(({ session }, destination) => {
      const listener = (_event: Event, item: DownloadItem) => {
        if (!item.getFilename().endsWith('.cruxmood')) return;
        session.defaultSession.removeListener('will-download', listener);
        item.setSavePath(destination);
      };
      session.defaultSession.on('will-download', listener);
    }, archive);
    await first.page.getByRole('button', { name: 'Export Shared atmosphere', exact: true }).click();
    await expect.poll(() => existsSync(archive)).toBe(true);
    await expect
      .poll(async () => {
        try {
          return !!(await JSZip.loadAsync(readFileSync(archive))).file('package.json');
        } catch {
          return false;
        }
      })
      .toBe(true);
  } finally {
    await first.app.close();
  }

  let second = await launchApp({ sound: true });
  const dir = second.dir;
  try {
    let page = second.page;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByLabel('Import a Mood file', { exact: true }).setInputFiles(archive);
    await expect(page.getByRole('status')).toContainText('Imported "Shared atmosphere"');
    await page.getByRole('button', { name: 'Apply Shared atmosphere', exact: true }).click();
    await expect.poll(async () => (await audio(page)).synth).toEqual(expected!);
    expect((await audio(page)).playing).toBe(false);
    await second.app.close();
    second = await launchApp({ dir, sound: true });
    page = second.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByRole('button', { name: 'Sound', exact: true }).click();
    const synth = page.getByRole('region', { name: 'Crux Synth', exact: true });
    await synth.locator('summary').click();
    await expect(
      synth.getByRole('button', { name: 'Load sound Between rooms', exact: true }),
    ).toBeVisible();
    await synth.getByRole('button', { name: 'Load sound Between rooms', exact: true }).click();
    expect((await audio(page)).synth).toEqual(expected!);
    await synth.getByRole('button', { name: 'Play synth', exact: true }).click();
    await expect.poll(async () => (await audio(page)).level).toBeGreaterThan(0.005);
    await synth.getByRole('button', { name: 'Pause synth', exact: true }).click();
  } finally {
    await second.app.close();
  }
});

test('a damaged Mood import reports failure and leaves the current sound intact', async () => {
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    const before = (await audio(page)).synth;
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const damaged = join(dir, 'damaged.cruxmood');
    writeFileSync(damaged, 'incomplete ZIP');
    await page.getByLabel('Import a Mood file', { exact: true }).setInputFiles(damaged);
    await expect(page.getByRole('status')).toContainText('Could not import this Mood');
    expect((await audio(page)).synth).toEqual(before);
    await expect(page.getByRole('button', { name: 'Import…', exact: true })).toBeEnabled();
    const valid = new JSZip();
    valid.file(
      'package.json',
      JSON.stringify({
        format: 'crux-mood',
        version: 1,
        name: 'Recovered sound',
        sound: { synth: before, synthPresets: [{ ...before, name: 'Retry preset' }] },
      }),
    );
    writeFileSync(damaged, await valid.generateAsync({ type: 'nodebuffer' }));
    await page.getByLabel('Import a Mood file', { exact: true }).setInputFiles(damaged);
    await expect(page.getByRole('status')).toContainText('Imported "Recovered sound"');
    await page.getByRole('button', { name: 'Apply Recovered sound', exact: true }).click();
    expect((await audio(page)).synth).toEqual(before);
  } finally {
    await app.close();
  }
});
