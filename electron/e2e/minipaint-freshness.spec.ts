import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

test('miniPaint refuses stale or missing state, preserves native drafts and permits zoom-only handoff', async () => {
  test.setTimeout(300000);
  const instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const page = instance.page;
  const evidence = resolve(__dirname, '../../docs/minipaint-freshness');
  mkdirSync(evidence, { recursive: true });
  const calls: any[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  const frame = page.frameLocator('iframe[data-crux-id]');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const layer = () => doc().project.layers.find((l: any) => l.name === 'Shared panel');
  const ready = () =>
    expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
  const save = async () => {
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const history = async (name: 'Undo' | 'Redo') => {
    await frame.getByText('Edit', { exact: true }).first().click();
    await frame.getByText(name, { exact: true }).first().click();
    await save();
  };
  const collaborate = async (scenario: string, count: number, error?: string) => {
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const before = new Set((await storedCrux(page, id)).messages.map((m: any) => m.timestamp));
    const toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const box = page.getByPlaceholder('Send a message...');
    await box.fill('Continue the picture [minipaint:fresh-' + scenario + ']');
    await box.press('Enter');
    const closing = 'Freshness ' + scenario + ' complete.';
    await expect
      .poll(
        async () =>
          (await storedCrux(page, id)).messages.some(
            (m: any) => !before.has(m.timestamp) && m.content === closing,
          ),
        { timeout: 120000 },
      )
      .toBe(true);
    const current = (await storedCrux(page, id)).messages
      .filter((m: any) => !before.has(m.timestamp) && m.content === closing)
      .flatMap((m: any) => m.toolCalls ?? []);
    expect(current).toHaveLength(count);
    const failures = current.filter((c: any) => c.result?.startsWith('Error'));
    expect(failures).toHaveLength(error ? 1 : 0);
    if (error) expect(failures[0].result).toContain(error);
    calls.push(...current);
    return current;
  };
  try {
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^miniPaint/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    await ready();
    await collaborate('create', 2);
    await collaborate('inspect', 1);
    // Keep focus in a native number input; the bridge must commit its blur history
    // before validating the agent's old inspection rather than overwriting it.
    await frame.locator('#detail_opacity').fill('60');
    await collaborate('edit', 1, 'changed since inspection');
    await save();
    expect(layer()).toMatchObject({ x: 20, opacity: 60 });
    await collaborate('retry', 2);
    expect(layer()).toMatchObject({ x: 80, opacity: 60, params: { fill_color: '#4477aa' } });
    await collaborate('missing', 1, 'changed since inspection');
    expect(layer().opacity).toBe(60);
    await collaborate('inspect', 1);
    const original = readFileSync(join(folder, 'data/project.json'), 'utf8');
    await history('Undo');
    await history('Redo');
    // Same artwork restored, but history changed: the previous token must still refuse.
    expect(readFileSync(join(folder, 'data/project.json'), 'utf8')).toBe(original);
    await collaborate('history', 1, 'changed since inspection');
    expect(layer()).toMatchObject({ x: 80, opacity: 60 });
    await collaborate('inspect', 1);
    await frame.getByRole('button', { name: 'Fit', exact: true }).click();
    await save();
    await collaborate('edit', 1);
    // Hold a native pointer gesture while sending the next message via keyboard.
    await collaborate('inspect', 1);
    const bounds = (await frame.locator('#canvas_minipaint').boundingBox())!;
    await page.mouse.move(bounds.x + 20, bounds.y + 20);
    await page.mouse.down();
    try {
      await collaborate('edit', 1, 'Finish the current drawing');
    } finally {
      await page.mouse.up();
    }
    await save();
    expect(
      doc().project.layers.some((item: any) => item.type === 'brush' && item.data.flat().length),
    ).toBe(true);
    await collaborate('retry', 2);
    expect(layer().opacity).toBe(60);
    await save();
    // An actual image import pauses at its local fetch. The person keeps editing
    // while the asset loads; the prepared agent mutation must then refuse.
    const fixture = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 4;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 4, 4);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    mkdirSync(join(folder, 'assets'), { recursive: true });
    const reloaded = page.waitForEvent('framenavigated', {
      predicate: (current) => current !== page.mainFrame() && /^http:/.test(current.url()),
    });
    writeFileSync(join(folder, 'assets/marker.png'), Buffer.from(fixture, 'base64'));
    await reloaded;
    await ready();
    await frame.locator('.layer_name').getByText('Shared panel', { exact: true }).click();
    await collaborate('inspect', 1);
    let requested = false;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/assets/marker.png', async (route) => {
      requested = true;
      await blocked;
      await route.continue();
    });
    const importing = collaborate('import', 1, 'changed since inspection');
    try {
      await expect.poll(() => requested, { timeout: 30000 }).toBe(true);
      await frame.locator('#detail_opacity').fill('55');
      await frame.locator('#detail_opacity').press('Tab');
    } finally {
      release();
    }
    await importing;
    await page.unroute('**/assets/marker.png');
    await save();
    expect(layer().opacity).toBe(55);
    expect(doc().project.layers.some((l: any) => l.name === 'Marker')).toBe(false);
    await collaborate('import-retry', 2);
    expect(doc().project.layers.find((l: any) => l.name === 'Marker')).toMatchObject({
      type: 'image',
      is_vector: false,
    });
    expect(layer().opacity).toBe(55);
    await save();
    writeFileSync(join(evidence, 'calls.json'), JSON.stringify(calls, null, 2));
    await page.screenshot({ path: join(evidence, 'shared-edits.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  } finally {
    await instance.app.close();
  }
});
