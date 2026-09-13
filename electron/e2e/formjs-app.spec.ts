import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * The form builder (the actual form-js editor and viewer, plus one page) as a
 * Crux Tool: a field dragged from the palette and a name typed in the header
 * reach data/project.json, the scripted collaborator names the form and adds
 * fields, Preview renders the viewer, the public edition publishes through the
 * Share pane and a filled-in copy served from the Crux's own folder lands an
 * answer in the Crux Store, the form survives a restart, and a complete Crux
 * archive imports into a clean Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('.fjs-palette-field').first()).toBeVisible();
}
async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6);
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
}
const middle = async (page: Page, selector: string) => {
  const box = (await frameOf(page).locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('Form: a dragged field and a typed name, agent fields, preview, publish with a stored answer, restart and clean import', async () => {
  test.setTimeout(12 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/formjs');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'form.crux');
  let folder = '';
  let id = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const fields = () => (doc().project?.schema?.components ?? []) as { type: string; key?: string; label?: string }[];
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the builder opens and the empty form saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Form\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Form folder', folder);
      await ready(page);
      await expect.poll(() => doc().project?.schema?.type ?? '').toBe('default');
      expect(fields()).toEqual([]);
      await page.screenshot({ path: join(evidence, 'formjs-initial.png') });
    });

    await test.step('a person names the form and drags a text field in; both are saved', async () => {
      await frameOf(page).locator('#form-name').fill('Open day');
      await ready(page);
      await expect.poll(() => doc().project?.name).toBe('Open day');
      await dragBetween(
        page,
        await middle(page, '.fjs-palette-field[data-field-type="textfield"]'),
        await middle(page, '.fjs-drop-container-vertical'),
      );
      await expect(frameOf(page).locator('.fjs-editor-form-root .fjs-form-field')).not.toHaveCount(0);
      await ready(page);
      await expect.poll(() => fields().length, { timeout: 30000 }).toBe(1);
      expect(fields()[0].type).toBe('textfield');
      await page.screenshot({ path: join(evidence, 'formjs-field.png') });
    });

    await test.step('the scripted collaborator names the form and adds two fields', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Make this an RSVP [form:build]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the form Open day RSVP and added the coming and notes fields.', { exact: true }),
      ).toBeVisible({ timeout: 150000 });
      await ready(page);
      expect(doc().project.name).toBe('Open day RSVP');
      expect(fields().map((f) => f.key)).toEqual(expect.arrayContaining(['coming', 'notes']));
      await expect(frameOf(page).getByText('Will you come?')).toBeVisible();
      await collab.click();
      await page.screenshot({ path: join(evidence, 'formjs-agent.png') });
    });

    await test.step('Preview renders the viewer; a trial submission shows its data and stores nothing', async () => {
      await frameOf(page).getByRole('tab', { name: 'Preview' }).click();
      const viewer = frameOf(page).locator('#viewer');
      await expect(viewer.getByText('Will you come?')).toBeVisible();
      await viewer.getByLabel('Yes').check();
      await frameOf(page).locator('#preview-submit').click();
      await expect(frameOf(page).locator('#preview-result')).toContainText('Preview only');
      await expect(frameOf(page).locator('#preview-result')).toContainText('"coming": "yes"');
      await page.screenshot({ path: join(evidence, 'formjs-preview.png') });
      await frameOf(page).getByRole('tab', { name: 'Edit' }).click();
      await ready(page);
    });

    await test.step('Share selected content publishes the viewer edition; an answer from the served form reaches the Crux Store', async () => {
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
      const published = api.state.published[id] ?? [];
      const paths = published.map((f) => f.path);
      expect(paths).toEqual(expect.arrayContaining(['index.html', 'form.json', 'viewer.js', 'vendor/form-viewer.umd.js']));
      expect(paths.some((p) => /^(data|vendor\/form-editor|garden)\//.test(p) || p === 'builder.js')).toBe(false);
      expect(published.find((f) => f.path === 'index.html')!.bytes.toString('utf8')).toContain('<title>Open day RSVP</title>');
      // The built edition sits in the Crux's dist/, served by the Crux's own preview server: the
      // Workshop frame can show it, and its answers go through the host's store proxy to the API.
      const previewOrigin = new URL(await page.locator('iframe[data-crux-id]').getAttribute('src').then((s) => s!)).origin;
      await page.locator('iframe[data-crux-id]').evaluate((el: HTMLIFrameElement, url) => { el.src = url; }, `${previewOrigin}/dist/index.html`);
      const served = frameOf(page);
      await expect(served.getByRole('heading', { name: 'Open day RSVP' })).toBeVisible();
      await served.getByLabel('Yes').check();
      await served.getByLabel('Anything we should know?').fill('Bringing seeds');
      await served.locator('#submit').click();
      await expect(served.getByRole('status')).toHaveText('Thank you, your answers were sent.');
      // In the Workshop the host's store proxy keeps answers in the author's local Crux Store
      // (the published page's SDK sends them to the API instead).
      const answers = () =>
        page.evaluate(
          async (cruxId) =>
            window.electronAPI!.sqlite.all(
              "SELECT key, value, mode FROM store WHERE crux_id = ? AND key LIKE 'response:%'",
              [cruxId],
            ),
          id,
        ) as Promise<{ key: string; value: string; mode: string }[]>;
      await expect.poll(async () => (await answers()).length, { timeout: 30000 }).toBe(1);
      const answer = (await answers())[0]!;
      expect(answer.mode).toBe('protected');
      expect(JSON.parse(answer.value).data).toMatchObject({ coming: 'yes', notes: 'Bringing seeds' });
      await page.screenshot({ path: join(evidence, 'formjs-published.png') });
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
    await test.step('restart: the form comes back with its fields', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#form-name')).toHaveValue('Open day RSVP');
      await expect(frameOf(page).getByText('Will you come?')).toBeVisible();
      await page.screenshot({ path: join(evidence, 'formjs-reopened.png') });
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
    await test.step('clean Garden: the complete Crux imports and the form is edited', async () => {
      await importNativeCrux(page, archive);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const importedId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).getByText('Will you come?')).toBeVisible();
      await frameOf(page).locator('#form-name').fill('Open day RSVP 2027');
      await ready(page);
      await expect.poll(() => doc().project.name).toBe('Open day RSVP 2027');
      await page.screenshot({ path: join(evidence, 'formjs-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
