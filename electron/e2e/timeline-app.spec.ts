import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * The Timeline tool (TimelineJS with the smallest editor around it) as a Crux
 * Tool: the starter year renders and saves; a person renames an event and adds
 * one in the editor; the scripted collaborator names the timeline and adds two
 * events; Share publishes the page with TimelineJS; the timeline survives a
 * restart; a complete Crux archive imports into a clean Garden.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('#timeline-embed .tl-timenav')).toBeVisible();
}

test('Timeline: the garden year renders and saves, a person edits events, the collaborator adds two, share, restart, clean import', async () => {
  test.setTimeout(10 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/timeline');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'timeline.crux');
  let folder = '';
  let id = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().includes('[garden]'))
        console.log(
          `[renderer ${message.type()}] ${message.text().slice(0, 500)} ${message.location().url}`,
        );
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the garden year renders and the starter saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Timeline\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect.poll(() => doc().project?.name ?? '').toBe('A Garden Year');
      expect(doc().project.timeline.events).toHaveLength(4);
      await expect(frameOf(page).locator('.tl-timemarker')).toHaveCount(4);
      await expect(frameOf(page).locator('#events .event')).toHaveCount(4);
      await page.screenshot({ path: join(evidence, 'timeline-initial.png') });
    });

    await test.step('a person renames the timeline, edits a headline and adds an event', async () => {
      const frame = frameOf(page);
      await frame.locator('#timeline-name').fill('Our Garden Year');
      await frame
        .locator('#events .event')
        .first()
        .locator('[data-field=headline]')
        .fill('First seeds on the sill');
      await ready(page);
      await expect
        .poll(() => doc().project.timeline.events[0].text.headline)
        .toBe('First seeds on the sill');
      expect(doc().project.name).toBe('Our Garden Year');
      await expect(
        frame.locator('.tl-timemarker-content-container', { hasText: 'First seeds on the sill' }),
      ).toBeVisible();
      await frame.getByRole('button', { name: 'Add event' }).click();
      const added = frame.locator('#events .event').last();
      await added.locator('[data-field=headline]').fill('Frost warning');
      await added.locator('[data-key=start_date][data-part=year]').fill('2026');
      await added.locator('[data-key=start_date][data-part=month]').fill('10');
      await added.locator('[data-key=start_date][data-part=day]').fill('18');
      await ready(page);
      await expect.poll(() => doc().project.timeline.events.length).toBe(5);
      await expect(frame.locator('.tl-timemarker')).toHaveCount(5);
      await page.screenshot({ path: join(evidence, 'timeline-edited.png') });
    });

    await test.step('the scripted collaborator names the timeline and adds two events', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Add the summer [timeline:story]');
      await box.press('Enter');
      await expect(
        page.getByText(
          'Named the timeline A Garden Year, Told and added two summer events with a picture.',
          { exact: true },
        ),
      ).toBeVisible({ timeout: 240000 });
      await ready(page);
      expect(doc().project.name).toBe('A Garden Year, Told');
      expect(doc().project.timeline.events).toHaveLength(7);
      expect(
        doc().project.timeline.events.find(
          (e: { unique_id: string }) => e.unique_id === 'midsummer',
        )!.media.url,
      ).toContain('http');
      await expect(frameOf(page).locator('.tl-timemarker')).toHaveCount(7);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'timeline-agent.png') });
    });

    await test.step('Share publishes the page with TimelineJS', async () => {
      await page
        .getByTestId('workshop-view')
        .getByRole('button', { name: 'Share selected content', exact: true })
        .click();
      const share = page.getByTestId('pane-body-publish');
      await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
      await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({
        timeout: 6 * 60_000,
      });
      const paths = (api.state.published[id] ?? []).map((f) => f.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'index.html',
          'app.js',
          'runtime/js/timeline.js',
          'runtime/css/timeline.css',
          'runtime/css/icons/tl-icons.woff2',
          'garden/bridge.js',
          'data/project.json',
        ]),
      );
      await page.screenshot({ path: join(evidence, 'timeline-published.png') });
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
    await test.step('restart: the timeline comes back with its name and events', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#timeline-name')).toHaveValue('A Garden Year, Told');
      await expect(frameOf(page).locator('.tl-timemarker')).toHaveCount(7);
      await page.screenshot({ path: join(evidence, 'timeline-reopened.png') });
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
    await test.step('clean Garden: the complete Crux imports and the timeline renders', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).locator('#timeline-name')).toHaveValue('A Garden Year, Told');
      await expect(frameOf(page).locator('.tl-timemarker')).toHaveCount(7);
      await page.screenshot({ path: join(evidence, 'timeline-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
