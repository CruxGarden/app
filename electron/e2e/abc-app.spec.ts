import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The Notation tool (abcjs with a vendored piano) as a Crux Tool: the starter
 * jig renders and the empty project saves; a person edits the ABC and saves an
 * SVG from the bar; the scripted collaborator names the score, writes a waltz
 * and saves a PNG; Share publishes the page with the soundfont; the score
 * survives a restart; a complete Crux archive imports into a clean Garden.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('#paper svg')).toBeVisible();
}

test('Notation: the jig renders and saves, a person edits and saves an SVG, the collaborator writes a waltz and a PNG, share, restart, clean import', async () => {
  test.setTimeout(10 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/abc');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'score.crux');
  let folder = '';
  let id = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the jig renders and the starter saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Notation\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect.poll(() => doc().project?.name ?? '').toBe('Score');
      expect(doc().project.abc).toContain('T:Moss on the Stone');
      await expect(frameOf(page).locator('#audio .abcjs-inline-audio')).toBeVisible();
      await page.screenshot({ path: join(evidence, 'abc-initial.png') });
    });

    await test.step('a person names the score, edits the ABC and saves an SVG', async () => {
      const frame = frameOf(page);
      await frame.locator('#score-name').fill('Moss on the Stone');
      const area = frame.locator('#abc');
      await area.fill('X:1\nT:Moss on the Stone\nM:6/8\nL:1/8\nK:D\n|: A | d2 f e2 d | c2 A A2 F | G2 B A2 c | d3 d2 :|\n');
      await ready(page);
      await expect.poll(() => doc().project?.abc ?? '').toContain('G2 B A2 c');
      expect(doc().project.name).toBe('Moss on the Stone');
      await frame.locator('#output-name').fill('Moss, vector');
      await frame.locator('#save-image').click();
      await expect(status(page)).toContainText('Saved Moss, vector as an image output', { timeout: 60000 });
      await expect.poll(() => outputs(folder).length).toBe(1);
      const [svg] = outputs(folder);
      expect(svg!.mimeType).toBe('image/svg+xml');
      expect(readFileSync(join(folder, svg!.path), 'utf8')).toContain('<svg');
      await page.screenshot({ path: join(evidence, 'abc-edited.png') });
    });

    await test.step('the scripted collaborator names it, writes a waltz and saves a PNG', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Write me a waltz [score:tune]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the score Moss Waltz, wrote a waltz in G and saved a PNG of it.', { exact: true }),
      ).toBeVisible({ timeout: 240000 });
      await ready(page);
      expect(doc().project.name).toBe('Moss Waltz');
      expect(doc().project.abc).toContain('M:3/4');
      await expect(frameOf(page).locator('#abc')).toHaveValue(/M:3\/4/);
      await expect.poll(() => outputs(folder).length).toBe(2);
      const png = outputs(folder).find((o) => o.label === 'Moss Waltz')!;
      expect(png.mimeType).toBe('image/png');
      expect(readFileSync(join(folder, png.path)).subarray(1, 4).toString()).toBe('PNG');
      await collab.click();
      await page.screenshot({ path: join(evidence, 'abc-agent.png') });
    });

    await test.step('Share publishes the page with the soundfont', async () => {
      await page.getByTestId('workshop-view').getByRole('button', { name: 'Share selected content', exact: true }).click();
      const share = page.getByTestId('pane-body-publish');
      await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
      await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({ timeout: 6 * 60_000 });
      const paths = (api.state.published[id] ?? []).map((f) => f.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'index.html',
          'style.css',
          'runtime/abcjs-basic-min.js',
          'runtime/soundfont/acoustic_grand_piano-mp3/C4.mp3',
          'garden/bridge.js',
          'data/project.json',
        ]),
      );
      await page.screenshot({ path: join(evidence, 'abc-published.png') });
      await page.getByRole('button', { name: 'Toggle share' }).click();
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the score comes back with its name, text and outputs', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#score-name')).toHaveValue('Moss Waltz');
      await expect(frameOf(page).locator('#abc')).toHaveValue(/Moss Waltz/);
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'abc-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and the score renders', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).locator('#score-name')).toHaveValue('Moss Waltz');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'abc-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
