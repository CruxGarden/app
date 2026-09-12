import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, renameSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1kAAAAASUVORK5CYII=',
  'base64',
);

test('Kan boards, attachments, agent cards, conflicts, restart, complete import and source rebuild', async () => {
  test.setTimeout(900000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/kan');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'board.crux');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const record = (key: string) => {
    const ref = doc().project?.[key]?.__cruxBinary;
    return ref ? JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8')) : null;
  };
  const boards = () =>
    Object.keys(doc().project ?? {})
      .filter((key) => key.startsWith('record-["kan","board"'))
      .map((key) => record(key));
  const cards = (name: string) =>
    boards()
      .find((board) => board.name === name)
      ?.lists.flatMap(
        (list: { cards: { title: string; index: number; deletedAt: string | null }[] }) =>
          list.cards
            .filter((card) => !card.deletedAt)
            .sort((a, b) => a.index - b.index)
            .map((card) => card.title),
      ) as string[] | undefined;
  const originals = () =>
    Object.entries(doc().project ?? {})
      .filter(([key]) => key.startsWith('file-'))
      .map(([, value]: [string, any]) => readFileSync(join(folder, 'data', value.__cruxBinary.path)));
  const ready = async (page: Page) => {
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    return frame;
  };
  const save = async (frame: FrameLocator) => {
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 20000,
    });
  };
  const addCard = async (frame: FrameLocator, title: string) => {
    await frame.getByRole('button', { name: 'Add card', exact: true }).first().click();
    await frame.getByPlaceholder('Card title').fill(title);
    await frame.getByRole('button', { name: 'Create card', exact: true }).click();
    await frame.getByText(title, { exact: true }).waitFor();
  };
  const pageErrors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(30000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('APP:', m.text(), m.location());
    });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /^Kan/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
    let frame = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Kan original Project Folder:', folder);
    // Manual planning in the native views.
    await frame.getByRole('button', { name: 'New', exact: true }).click();
    await frame.getByPlaceholder('Name', { exact: true }).fill('Game plan');
    await frame.getByRole('button', { name: 'Create board', exact: true }).click();
    for (const name of ['Art', 'Sound', 'Done']) {
      await frame.getByRole('button', { name: 'New list', exact: true }).click();
      await frame.getByPlaceholder('List name').fill(name);
      await frame.getByRole('button', { name: 'Create list', exact: true }).click();
      await frame
        .getByRole('textbox', { name: 'List name', exact: true })
        .filter({ visible: true })
        .last()
        .waitFor();
    }
    await addCard(frame, 'Draw the hero sprite');
    await frame.getByText('Draw the hero sprite', { exact: true }).click();
    await frame
      .locator('#attachment-upload')
      .setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer: PIXEL });
    await frame.locator('img[alt="hero.png"]').first().waitFor();
    await frame.getByRole('button', { name: 'Add checklist', exact: true }).click();
    await frame.getByPlaceholder('Checklist name').fill('Frames');
    await frame.getByRole('button', { name: 'Create checklist', exact: true }).click();
    await frame.getByText('Frames', { exact: true }).waitFor();
    await save(frame);
    expect(cards('Game plan')).toEqual(['Draw the hero sprite']);
    expect(originals().some((bytes) => bytes.equals(PIXEL))).toBe(true);
    // A scoped agent turn works through the same native operations.
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Add a card for the agent [kan:edit]');
    await chat.press('Enter');
    await expect.poll(() => cards('Game plan'), { timeout: 60000 }).toEqual([
      'Draw the hero sprite',
      'Agent renamed card',
    ]);
    await frame.getByRole('link', { name: 'Kan · Boards', exact: true }).click();
    await frame.getByText('Game plan', { exact: true }).click();
    await expect(frame.getByText('Agent renamed card', { exact: true })).toBeVisible();
    // Delete, duplicate and archive through native controls; history stays in the record.
    await frame.getByText('Agent renamed card', { exact: true }).click({ button: 'right' });
    await frame.getByText('Delete card', { exact: true }).click();
    await frame.getByRole('button', { name: 'Delete', exact: true }).click();
    await frame.getByText('Agent renamed card', { exact: true }).waitFor({ state: 'hidden' });
    await save(frame);
    expect(cards('Game plan')).toEqual(['Draw the hero sprite']);
    expect(
      boards()[0].lists[0].cards.some(
        (card: { title: string; deletedAt: string | null }) =>
          card.title === 'Agent renamed card' && card.deletedAt,
      ),
    ).toBe(true);
    await page.screenshot({ path: join(evidence, 'kan-workshop.png') });
    // An outside writer must win; the rejected save keeps the current native draft.
    const external = doc();
    const key = Object.keys(external.project).find((k) => k.startsWith('record-["kan","board"'))!;
    const changed = { ...record(key), name: 'External plan' };
    const bytes = Buffer.from(JSON.stringify(changed));
    const hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'data/assets', hash + '.bin'), bytes);
    external.project[key] = {
      __cruxBinary: { path: `assets/${hash}.bin`, kind: 'buffer', type: 'application/json', size: bytes.length },
    };
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await addCard(frame, 'Unsaved draft card');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(cards('External plan')).toEqual(['Draw the hero sprite']);
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await frame.getByRole('button', { name: 'Discard and reload', exact: true }).click();
    frame = await ready(page);
    await expect(frame.getByRole('textbox', { name: 'Board name', exact: true })).toHaveValue('External plan');
    await expect(frame.getByText('Unsaved draft card', { exact: true })).toHaveCount(0);
    await addCard(frame, 'Compose the theme');
    await save(frame);
    expect(cards('External plan')).toEqual(['Compose the theme', 'Draw the hero sprite']); // header Add card inserts first
    expect(pageErrors).toEqual([]);
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = await ready(second.page);
    await expect(frame.getByText('Compose the theme', { exact: true })).toBeVisible();
    await frame.getByText('Draw the hero sprite', { exact: true }).click();
    await frame.locator('img[alt="hero.png"]').first().waitFor();
    await second.page.screenshot({ path: join(evidence, 'kan-reopened.png') });
    await exportNativeCrux(second.page, archive, second.app);
  } finally {
    await second.app.close();
  }
  const originalFolder = folder;
  renameSync(originalFolder, originalFolder + '-unavailable');
  const third = await launchApp();
  try {
    await third.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(third.page);
    await importNativeCrux(third.page, archive);
    const frame = await ready(third.page);
    folder = (
      await storedCrux(
        third.page,
        (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    console.log('Kan imported Project Folder:', folder);
    expect(folder).not.toBe(originalFolder);
    expect(cards('External plan')).toEqual(['Compose the theme', 'Draw the hero sprite']);
    expect(originals().some((bytes) => bytes.equals(PIXEL))).toBe(true);
    // The saved route reopens the card that was open at export time.
    await expect(frame.locator('#title')).toHaveValue('Draw the hero sprite');
    await frame.locator('img[alt="hero.png"]').first().waitFor();
    await frame.getByRole('link', { name: 'Kan · Boards', exact: true }).click();
    await frame.getByText('External plan', { exact: true }).click();
    await addCard(frame, 'Imported follow-up');
    await save(frame);
    expect(cards('External plan')).toEqual([
      'Imported follow-up',
      'Compose the theme',
      'Draw the hero sprite',
    ]);
    await third.page.screenshot({ path: join(evidence, 'kan-imported.png') });
  } finally {
    await third.app.close();
    renameSync(originalFolder + '-unavailable', originalFolder);
  }
  // The imported source rebuilds its own runtime with a clean install.
  const rebuild = join(tmpdir(), `crux-kan-rebuild-${Date.now()}`);
  cpSync(folder, rebuild, {
    recursive: true,
    filter: (source) => !/\/(node_modules|runtime|data|\.git)(\/|$)/.test(source),
  });
  expect(existsSync(join(rebuild, 'runtime/index.html'))).toBe(false);
  execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: rebuild, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: rebuild, stdio: 'inherit' });
  expect(existsSync(join(rebuild, 'runtime/index.html'))).toBe(true);
  expect(readFileSync(join(rebuild, 'runtime/THIRD_PARTY_NOTICES.txt'), 'utf8')).toContain('AGPL');
});
