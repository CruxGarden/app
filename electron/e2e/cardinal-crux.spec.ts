import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

test('Cardinal instrument: native engine, sound, saves, rack and restart', async () => {
  test.setTimeout(180000);
  const evidence = resolve(__dirname, '../../docs/cardinal');
  mkdirSync(evidence, { recursive: true });
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  try {
    const { page } = first;
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(message.text());
    });
    page.on('pageerror', (error) => console.log(error.message));
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Cardinal Drone/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#status')).toHaveText(/Saved in this Crux|Not saved/, {
      timeout: 100000,
    });
    await expect(frame.locator('#error')).toBeHidden();
    await expect(frame.locator('#status')).toHaveText('Saved in this Crux');
    await expect(frame.getByRole('slider')).toHaveCount(6);
    const positions = await frame
      .locator('body')
      .evaluate(() =>
        JSON.parse(
          (window as any).Module.ccall('garden_call', 'string', ['string'], ['{"op":"describe"}']),
        ).patch.modules.map((m: any) => m.pos),
      );
    expect(positions).toHaveLength(7);
    expect(
      positions.every((pos: number[]) =>
        pos.every((value) => Number.isFinite(value) && Math.abs(value) < 1000),
      ),
    ).toBe(true);
    expect(
      await frame
        .locator('body')
        .evaluate(() => (window as any).Module.WebAudioBridge.audioContext.state),
    ).toBe('suspended');
    await frame.locator('body').evaluate(() => {
      const bridge = (window as any).Module.WebAudioBridge;
      const original = bridge.processor.onaudioprocess;
      bridge.gardenTestPeak = 0;
      bridge.processor.onaudioprocess = (event: AudioProcessingEvent) => {
        original(event);
        for (const sample of event.outputBuffer.getChannelData(0))
          bridge.gardenTestPeak = Math.max(bridge.gardenTestPeak, Math.abs(sample));
      };
    });
    await frame.getByRole('button', { name: 'Start sound', exact: true }).click();
    await expect
      .poll(() =>
        frame.locator('body').evaluate(() => (window as any).Module.WebAudioBridge.gardenTestPeak),
      )
      .toBeGreaterThan(0.0001);

    await expect(frame.locator('#playing')).toHaveText('Playing through Cardinal');
    expect(
      await frame
        .locator('body')
        .evaluate(() => (window as any).Module.WebAudioBridge.audioContext.state),
    ).toBe('running');
    await frame
      .getByRole('slider', { name: 'Brightness' })
      .evaluate((element: HTMLInputElement) => {
        element.value = '0.7';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await expect
      .poll(() => {
        const doc = JSON.parse(readFileSync(join(folder, 'music/instrument.json'), 'utf8'));
        return doc.patch.modules.find((m: any) => m.id === 5).params.find((p: any) => p.id === 0)
          .value;
      })
      .toBeCloseTo(0.67, 4);
    await frame.getByRole('button', { name: 'Stop sound', exact: true }).click();
    await expect(frame.locator('#status')).toHaveText('Saved in this Crux');
    await page.screenshot({ path: join(evidence, 'instrument.png') });
    await frame.getByRole('button', { name: /Open rack/ }).click();
    await expect(frame.locator('#canvas')).toBeVisible();
    const bounds = (await frame.locator('#canvas').boundingBox())!;
    await page.mouse.move(bounds.x + 25, bounds.y + 110);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 25, bounds.y + 90, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        frame.locator('body').evaluate(
          () =>
            JSON.parse(
              (window as any).Module.ccall(
                'garden_call',
                'string',
                ['string'],
                ['{"op":"describe"}'],
              ),
            )
              .patch.modules.find((m: any) => m.id === 1)
              .params.find((p: any) => p.id === 2).value,
        ),
      )
      .not.toBe(-24);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(evidence, 'rack.png') });
    await frame.getByRole('button', { name: 'Back to instrument' }).click();
    await expect(frame.getByRole('slider', { name: 'Brightness' })).toHaveValue('0.7');
    await frame.getByLabel('Name your preset').fill('Our horizon');
    await frame.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect
      .poll(
        () =>
          JSON.parse(readFileSync(join(folder, 'music/instrument.json'), 'utf8')).presets.at(-1)
            .name,
      )
      .toBe('Our horizon');
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Make the drone darker and more spacious [instrument:controls]');
    await chat.press('Enter');
    await expect(
      page.getByText('Instrument controls saved and inspected.', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(frame.getByRole('slider', { name: 'Brightness' })).toHaveValue('0.2');
    await expect(frame.getByRole('slider', { name: 'Space' })).toHaveValue('0.85');
    await expect
      .poll(
        () =>
          JSON.parse(readFileSync(join(folder, 'music/instrument.json'), 'utf8'))
            .patch.modules.find((m: any) => m.id === 5)
            .params.find((p: any) => p.id === 0).value,
      )
      .toBeCloseTo(0.37, 4);
    await page.screenshot({ path: join(evidence, 'agent-controls.png') });
    await chat.fill('Choose Low Orbit [instrument:preset]');
    await chat.press('Enter');
    await expect(
      page.getByText('Instrument preset saved and inspected.', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const documentPath = join(folder, 'music/instrument.json');
    const external = JSON.parse(readFileSync(documentPath, 'utf8'));
    external.patch.modules.find((m: any) => m.id === 5).params.find((p: any) => p.id === 0).value =
      0.49;
    writeFileSync(documentPath, JSON.stringify(external));
    await frame
      .getByRole('slider', { name: 'Brightness' })
      .evaluate((element: HTMLInputElement) => {
        element.value = '0.8';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await expect(frame.locator('#error')).toContainText('changed elsewhere');
    await expect(frame.getByRole('slider', { name: 'Brightness' })).toHaveValue('0.8');
    expect(
      JSON.parse(readFileSync(documentPath, 'utf8'))
        .patch.modules.find((m: any) => m.id === 5)
        .params.find((p: any) => p.id === 0).value,
    ).toBe(0.49);
    page.once('dialog', (dialog) => void dialog.accept());
    await frame.getByRole('button', { name: 'Reload saved instrument' }).click();
    await expect(frame.getByRole('slider', { name: 'Brightness' })).toHaveValue('0.4');
    await expect(frame.locator('#error')).toBeHidden();
  } finally {
    await first.page.screenshot({ path: join(evidence, 'last-state.png') }).catch(() => {});
    await first.app.close();
  }
  const again = await launchApp({ dir: first.dir });
  try {
    await again.page.getByRole('button', { name: /enter/i }).click();
    const frame = again.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#status')).toHaveText(/Saved in this Crux|Not saved/, {
      timeout: 100000,
    });
    await expect(frame.locator('#error')).toBeHidden();
    await expect(frame.locator('#status')).toHaveText('Saved in this Crux');
    await expect(frame.getByRole('slider', { name: 'Brightness' })).toHaveValue('0.4');
    await expect(frame.locator('#preset option', { hasText: 'Our horizon' })).toHaveCount(1);
    expect(
      await frame
        .locator('body')
        .evaluate(() => (window as any).Module.WebAudioBridge.audioContext.state),
    ).toBe('suspended');
  } finally {
    await again.app.close();
  }
});
