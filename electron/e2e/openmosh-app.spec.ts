import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
test('actual OpenMosh: native effects, agent, originals and restart', async () => {
  test.setTimeout(180000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/openmosh');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  try {
    const { page } = first;
    page.on('pageerror', (e) => console.log('OpenMosh error', e.message));
    await page.setViewportSize({ width: 1700, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^OpenMosh/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('OpenMosh project', folder);
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project')).toBeVisible({ timeout: 60000 });
    await expect(frame.getByRole('button', { name: 'Single', exact: true })).toBeVisible();
    await page.screenshot({ path: join(evidence, 'openmosh-start.png') });
    await frame
      .locator('input[type=file]')
      .first()
      .setInputFiles(resolve(__dirname, '../../tool-cruxes/openmosh/assets/demo.png'));
    await expect(frame.getByRole('button', { name: /Posterize/ }).first()).toBeVisible();
    const rack = frame
      .locator('.strip')
      .filter({ has: frame.getByRole('button', { name: /Posterize/ }) });
    await rack.locator('button.toggle').click();
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 20000,
    });
    const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
    await expect.poll(() => doc().databases['openmosh-sequence-media'].sessions.length).toBe(1);
    expect(
      doc().databases['openmosh-sequence-media'].sessions[0].state.effects.find(
        (e: any) => e.defId === 'posterize',
      ).enabled,
    ).toBe(true);
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Set posterize to four levels [openmosh:effect]');
    await chat.press('Enter');
    await expect(page.getByText('Saved the native OpenMosh effect.', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await expect
      .poll(
        () =>
          doc().databases['openmosh-sequence-media'].sessions[0].state.effects.find(
            (e: any) => e.defId === 'posterize',
          ).values.levels,
      )
      .toBe(4);
    const original = doc().databases['openmosh-sequence-media'].media[0].blob.__cruxBinary.path;
    expect(
      readFileSync(join(folder, 'data', original)).equals(
        readFileSync(resolve(__dirname, '../../tool-cruxes/openmosh/assets/demo.png')),
      ),
    ).toBe(true);
    await page.screenshot({ path: join(evidence, 'openmosh-workshop.png') });
    await frame.getByRole('button', { name: 'Save frame to Cruxspace', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText(
      'Frame saved to Cruxspace',
    );
    // Use OpenMosh's own image and video exporters, waiting for Electron's
    // completed-download event instead of reading a partially written file.
    async function download(path: string, action: () => Promise<void>) {
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__openmoshDownload = null;
        session.defaultSession.once('will-download', (_event, item) => {
          item.setSavePath(path);
          item.once('done', (_event, state) => {
            (globalThis as any).__openmoshDownload = state;
          });
        });
      }, path);
      await action();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__openmoshDownload), {
          timeout: 45000,
        })
        .toBe('completed');
      return readFileSync(path);
    }
    await frame.getByRole('button', { name: 'PNG', exact: true }).first().click();
    const png = await download(join(first.dir, 'native.png'), () =>
      frame.getByRole('button', { name: 'SAVE', exact: true }).click(),
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    await frame.getByRole('button', { name: 'WebM', exact: true }).first().click();
    await frame.getByRole('button', { name: 'RECORD', exact: true }).click();
    await frame.getByLabel('Duration', { exact: true }).fill('1');
    await frame.getByLabel('Duration', { exact: true }).press('Tab');
    await frame.getByLabel('FPS', { exact: true }).selectOption('15');
    const webm = await download(join(first.dir, 'native.webm'), () =>
      frame.getByRole('button', { name: 'Start Recording', exact: true }).click(),
    );
    expect(webm.subarray(0, 4).toString('hex')).toBe('1a45dfa3');
    // An external change wins; the original native UI keeps the unsaved draft.
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    const external = doc();
    external.local['openmosh-external'] = 'kept';
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await rack.locator('button.toggle').click();
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(doc().local['openmosh-external']).toBe('kept');
    expect(
      doc().databases['openmosh-sequence-media'].sessions[0].state.effects.find(
        (e: any) => e.defId === 'posterize',
      ).enabled,
    ).toBe(true);
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await frame.getByRole('button', { name: /demo.png/ }).click();
    await expect(frame.getByRole('button', { name: /Posterize/ }).first()).toBeVisible();
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    writeFileSync(
      join(evidence, 'project-structure.json'),
      JSON.stringify(
        {
          stores: Object.keys(doc().databases),
          effects: doc().databases['openmosh-sequence-media'].sessions[0].state.effects.length,
          original,
        },
        null,
        2,
      ),
    );
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project')).toBeVisible({ timeout: 60000 });
    await frame.getByRole('button', { name: /demo.png/ }).click();
    await expect(frame.getByRole('button', { name: /Posterize/ }).first()).toBeVisible();
    await second.page.screenshot({ path: join(evidence, 'openmosh-reopened.png') });
  } finally {
    await second.app.close();
  }
});

for (const mode of ['Editor', 'Slideshow'] as const)
  test(`actual OpenMosh: audio, video and native project survive reopening in ${mode} mode`, async () => {
    test.setTimeout(180000);
    const run = await launchApp();
    try {
      const { execFileSync } = await import('node:child_process');
      const ffmpeg = (await import('ffmpeg-static')).default;
      const video = join(run.dir, 'clip.webm'),
        audio = join(run.dir, 'song.wav');
      execFileSync(
        ffmpeg!,
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=160x120:rate=15',
          '-t',
          '2',
          '-c:v',
          'libvpx-vp9',
          video,
        ],
        { stdio: 'ignore' },
      );
      execFileSync(
        ffmpeg!,
        ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100', '-t', '4', audio],
        { stdio: 'ignore' },
      );
      const { page } = run;
      await page.setViewportSize({ width: 1900, height: 1150 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^OpenMosh/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const folder = (await storedCrux(page, id)).projectFolder;
      const frame = page.frameLocator('iframe[data-crux-id]');
      await frame.getByRole('button', { name: mode, exact: true }).click({ timeout: 45000 });
      await frame.locator('input[type=file][accept^="audio/"]').setInputFiles(audio);
      await frame
        .locator('input[type=file]')
        .first()
        .setInputFiles([video, resolve(__dirname, '../../tool-cruxes/openmosh/assets/demo.png')]);
      await expect(frame.getByTitle('Back to upload', { exact: true })).toBeVisible();
      const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
      await expect
        .poll(() => doc().databases['openmosh-tracks']?.tracks.length, { timeout: 30000 })
        .toBe(1);
      await frame.getByRole('button', { name: 'Save project', exact: true }).click();
      await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
        timeout: 30000,
      });
      await expect.poll(() => doc().databases['openmosh-sequence-media'].media.length).toBe(2);
      if (mode === 'Editor') {
        expect(doc().databases['openmosh-sequence-media'].pools.length).toBeGreaterThan(0);
        expect(doc().databases['openmosh-sequence-media'].timelines.length).toBeGreaterThan(0);
      } else expect(doc().databases['openmosh-sequence-media'].sessions[0].mode).toBe('slideshow');
      expect(doc().databases['openmosh-sequence-media'].proxies).toBeUndefined();
      const track = doc().databases['openmosh-tracks'].tracks[0];
      expect(
        readFileSync(join(folder, 'data', track.blob.__cruxBinary.path)).equals(
          readFileSync(audio),
        ),
      ).toBe(true);
      const original = doc().databases['openmosh-sequence-media'].media.find(
        (m: any) => m.name === 'clip.webm',
      );
      expect(
        readFileSync(join(folder, 'data', original.blob.__cruxBinary.path)).equals(
          readFileSync(video),
        ),
      ).toBe(true);
      const state = () =>
        mode === 'Editor'
          ? doc().databases['openmosh-sequence-media'].timelines[0].state.segments
          : doc().databases['openmosh-sequence-media'].sessions[0].state.config;
      const before = state();
      await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
      await frame.getByRole('button', { name: mode, exact: true }).click();
      await frame.getByRole('button', { name: /song.wav/ }).click();
      await expect(frame.getByTitle('Back to upload', { exact: true })).toBeVisible();
      await frame.getByRole('button', { name: 'Save project', exact: true }).click();
      await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
      expect(state()).toEqual(before);
      const evidence = resolve(__dirname, '../../docs/openmosh');
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, `openmosh-${mode.toLowerCase()}.png`) });
    } finally {
      await run.app.close();
    }
  });
