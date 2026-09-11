import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('Twine native writing, play, export, agents and portable library', async () => {
  test.setTimeout(240000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/twine');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'stories.crux');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const library = () =>
    Object.fromEntries(
      Object.entries(doc().project || {}).map(([key, value]: [string, any]) => [
        key,
        JSON.parse(readFileSync(join(folder, 'data', value.__cruxBinary.path), 'utf8')),
      ]),
    );
  const stories = () =>
    Object.entries(library())
      .filter(([key]) => key.startsWith('twine-stories-'))
      .map(([, value]) => JSON.parse(value as string));
  const passages = () =>
    Object.entries(library())
      .filter(([key]) => key.startsWith('twine-passages-'))
      .map(([, value]) => JSON.parse(value as string));
  const ready = async (page: Page) => {
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    return frame;
  };
  const edit = async (frame: FrameLocator, name: string, text: string) => {
    await frame.getByRole('button', { name, exact: true }).click();
    await frame.getByRole('tab', { name: 'Passage', exact: true }).click();
    await frame.getByRole('button', { name: 'Edit', exact: true }).click();
    await frame.getByLabel('Passage Text').pressSequentially(text);
    await frame.getByRole('button', { name: 'Close', exact: true }).click();
  };
  const openStory = async (frame: FrameLocator, name: string) => {
    await frame.getByRole('button', { name, exact: true }).click();
    await frame.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(frame.getByRole('tab', { name: 'Passage', exact: true })).toBeVisible();
  };
  const play = async (frame: FrameLocator) => {
    await frame.getByRole('tab', { name: 'Build', exact: true }).click();
    await frame.getByRole('button', { name: 'Play', exact: true }).click();
    const game = frame.frameLocator('#garden-story-preview iframe');
    await expect(game.locator('tw-passage')).toContainText('A lantern glows.');
    await game.getByText('Follow', { exact: true }).click();
    await expect(game.locator('tw-passage')).toContainText('The garden wakes.');
    await frame.getByRole('button', { name: 'Return to story editor', exact: true }).click();
  };
  try {
    const { page } = first;
    await page.setViewportSize({ width: 2000, height: 1200 });
    await page
      .context()
      .route(/^https?:\/\//, (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      );
    page.on('pageerror', (e) => console.log('Twine error', e.message));
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Twine/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Twine folder', folder);
    await frame.getByRole('button', { name: 'Skip', exact: true }).click();
    await frame.getByRole('button', { name: 'New', exact: true }).click();
    await frame.getByRole('textbox').fill('Lantern Trail');
    await frame.getByRole('button', { name: 'Create', exact: true }).click();
    await edit(frame, 'Untitled Passage', 'A lantern glows. [[Follow]]');
    await expect(frame.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
    await edit(frame, 'Follow', 'The garden wakes.');
    // Play immediately: Garden must flush Twine's debounced passage draft.
    await play(frame);
    await expect
      .poll(() => passages().find((p) => p.name === 'Follow')?.text)
      .toBe('The garden wakes.');
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Name this story [twine:title]');
    await chat.press('Enter');
    await expect.poll(() => stories()[0]?.name, { timeout: 45000 }).toBe('The Lantern Garden');
    const download = async (label: string, name: string) => {
      const path = join(first.dir, name);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__storyDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__storyDownload = state;
          });
        });
      }, path);
      await frame.getByRole('button', { name: label, exact: true }).click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__storyDownload), {
          timeout: 30000,
        })
        .toBe('completed');
      return readFileSync(path, 'utf8');
    };
    const html = await download('Publish to File', 'lantern.html');
    expect(
      await page.evaluate((html) => {
        const d = new DOMParser().parseFromString(html, 'text/html');
        return {
          name: d.querySelector('tw-storydata')?.getAttribute('name'),
          passages: [...d.querySelectorAll('tw-passagedata')].map((p) => p.textContent),
        };
      }, html),
    ).toEqual({
      name: 'The Lantern Garden',
      passages: ['A lantern glows. [[Follow]]', 'The garden wakes.'],
    });
    const twee = await download('Export As Twee', 'lantern.twee');
    expect(twee).toContain(':: Follow');
    expect(twee).toContain('The garden wakes.');
    await chat.fill('Add a linked ending [twine:passage]');
    await chat.press('Enter');
    await expect
      .poll(() => passages().find((p) => p.name === 'Follow')?.text)
      .toBe('The garden wakes. [[Epilogue]]');
    await expect.poll(() => passages().some((p) => p.name === 'Epilogue')).toBe(true);
    const external = doc();
    const key = Object.keys(external.project).find((k) => k.startsWith('twine-stories-'))!;
    const story = { ...stories()[0], name: 'Externally saved story' };
    const bytes = Buffer.from(JSON.stringify(JSON.stringify(story)));
    const hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'data/assets', hash + '.bin'), bytes);
    external.project[key] = {
      __cruxBinary: {
        path: `assets/${hash}.bin`,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.length,
      },
    };
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await edit(frame, 'Follow', ' Local draft.');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(stories()[0].name).toBe('Externally saved story');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await ready(page);
    await expect
      .poll(() => passages().find((p) => p.name === 'Follow')?.text)
      .toBe('The garden wakes. [[Epilogue]]');
    await page.screenshot({ path: join(evidence, 'twine-workshop.png'), animations: 'disabled' });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = await ready(second.page);
    await openStory(frame, 'Externally saved story');
    await play(frame);
    await second.page.screenshot({
      path: join(evidence, 'twine-reopened.png'),
      animations: 'disabled',
    });
    await exportNativeCrux(second.page, archive);
  } finally {
    await second.app.close();
  }
  const oldFolder = folder;
  renameSync(oldFolder, oldFolder + '-unavailable');
  const third = await launchApp();
  try {
    await third.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(third.page);
    await importNativeCrux(third.page, archive);
    const frame = await ready(third.page);
    const id = (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(third.page, id)).projectFolder;
    expect(folder).not.toBe(oldFolder);
    await openStory(frame, 'Externally saved story');
    await play(frame);
    await edit(frame, 'Follow', ' A portable ending.');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(() => passages().find((p) => p.name === 'Follow')?.text)
      .toContain('A portable ending.');
    await ready(third.page);
    await third.page.screenshot({
      path: join(evidence, 'twine-imported.png'),
      animations: 'disabled',
    });
  } finally {
    await third.app.close();
    renameSync(oldFolder + '-unavailable', oldFolder);
  }
});
