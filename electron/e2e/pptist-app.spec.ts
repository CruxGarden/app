import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * PPTist (the actual editor) as a Crux Tool: a slide added and a picture
 * inserted through the real UI are saved as data/project.json (the picture as
 * a binary Artifact), the scripted collaborator edits through App Tools, the
 * deck survives a restart, and a complete Crux archive imports into a clean
 * Garden with the source folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });
  await expect(frameOf(page).locator('.thumbnails')).toBeVisible();
}
const thumbnails = (page: Page) => frameOf(page).locator('.thumbnail-item');

test('PPTist: real slide and picture edits, saved deck with media Artifacts, agent tools, restart and clean import', async () => {
  test.setTimeout(15 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/pptist');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'deck.crux');
  const picture = resolve(__dirname, 'fixtures/glow-garden/seed.png');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const imageRef = () => {
    for (const slide of doc().project?.slides ?? [])
      for (const el of slide.elements)
        if (el.type === 'image' && el.src?.__cruxBinary)
          return el.src.__cruxBinary as { path: string; size: number };
    return null;
  };
  const errors: string[] = [];
  let slideCount = 0;
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        console.log('APP:', m.type(), m.text().slice(0, 300));
    });
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);

    await test.step('create from the picker; the editor opens with its starter deck and saves it', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^PPTist/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('PPTist folder', folder);
      await ready(page);
      await expect.poll(() => doc().project?.slides?.length ?? 0).toBeGreaterThan(0);
      slideCount = doc().project.slides.length;
      await expect(thumbnails(page)).toHaveCount(slideCount);
      await page.screenshot({ path: join(evidence, 'pptist-initial.png') });
    });

    await test.step('a person adds a slide and inserts a picture through the real UI', async () => {
      await frameOf(page).getByText('添加幻灯片', { exact: true }).click();
      await expect(thumbnails(page)).toHaveCount(slideCount + 1);
      await frameOf(page).locator('input[type="file"]').first().setInputFiles(picture);
      await expect(frameOf(page).locator('.editor-area img, .viewport img').first()).toBeVisible();
      await ready(page);
      await expect.poll(() => doc().project.slides.length).toBe(slideCount + 1);
      // The picture is a binary Artifact, not a data URL inside the document.
      await expect.poll(() => imageRef()?.path ?? '').toMatch(/^assets\/[a-f0-9]{64}\.bin$/);
      expect(existsSync(join(folder, 'data', imageRef()!.path))).toBe(true);
      expect(readFileSync(join(folder, 'data', imageRef()!.path))).toEqual(readFileSync(picture));
      expect(JSON.stringify(doc())).not.toContain('data:image');
      await page.screenshot({ path: join(evidence, 'pptist-picture.png') });
    });

    await test.step('the scripted collaborator titles the deck and adds an agenda slide', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Title the deck and add an agenda [pptist:edit]');
      await box.press('Enter');
      await expect(
        page.getByText('Titled the deck Garden launch and added an agenda slide.', { exact: true }),
      ).toBeVisible({ timeout: 150000 });
      await ready(page);
      expect(doc().project.title).toBe('Garden launch');
      expect(doc().project.slides.length).toBe(slideCount + 2);
      expect(JSON.stringify(doc().project.slides)).toContain('Agent agenda'); // inserted after the current slide
      await expect(thumbnails(page)).toHaveCount(slideCount + 2);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'pptist-agent.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await test.step('restart: the deck reopens with its title, slides and picture', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      await expect(thumbnails(page)).toHaveCount(slideCount + 2);
      await expect(frameOf(page).locator('.title').first()).toContainText('Garden launch');
      await thumbnails(page).nth(slideCount).click();
      await expect(frameOf(page).locator('img[src^="blob:"]').first()).toBeVisible();
      await page.screenshot({ path: join(evidence, 'pptist-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
  }

  renameSync(folder, `${folder}-unavailable`);
  const third = await launchApp();
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await test.step('clean Garden: the complete Crux imports with its picture and editing continues', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect(thumbnails(page)).toHaveCount(slideCount + 2);
      expect(existsSync(join(folder, 'data', imageRef()!.path))).toBe(true);
      await thumbnails(page).nth(slideCount).click();
      await expect(frameOf(page).locator('img[src^="blob:"]').first()).toBeVisible();
      await frameOf(page).getByText('添加幻灯片', { exact: true }).click();
      await ready(page);
      await expect.poll(() => doc().project.slides.length).toBe(slideCount + 3);
      await page.screenshot({ path: join(evidence, 'pptist-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
