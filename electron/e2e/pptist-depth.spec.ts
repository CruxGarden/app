import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('PPTist depth: create a deck, person revises, targeted agent edit, native Undo, PPTX, restart and portable editing', async () => {
  test.setTimeout(600000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'presentation.crux');
  const evidence = resolve(__dirname, '../../docs/presentation-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 180000,
    });
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const check = async () => {
    expect(doc().project.slides).toHaveLength(2);
    expect(doc().project.title).toBe('Seed library launch');
    expect(JSON.stringify(doc().project.slides)).toContain('Saturday');
    expect(JSON.stringify(doc().project.slides)).toContain('Bring envelopes.');
    expect(doc().project.slides[0].elements[0].top).toBe(80);
    const output = outputs(folder).find((item) => item.label === 'Seed library launch')!;
    expect(output.mimeType).toContain('presentationml.presentation');
    const xml = execFileSync('unzip', [
      '-p',
      join(folder, output.path),
      'ppt/slides/slide1.xml',
    ]).toString();
    expect(xml).toContain('Saturday');
    expect(xml).toContain('Bring envelopes.');
    expect(xml).not.toContain('Friday');
    await expect(frame().locator('.thumbnail-item')).toHaveCount(2);
  };
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^PPTist/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const workspace = page.locator('[data-workspace-id]');
    await expect(workspace).toBeVisible();
    folder = (await storedCrux(page, (await workspace.getAttribute('data-workspace-id'))!))
      .projectFolder;
    await ready();
    await collaborator(
      page,
      'Make a seed library event deck [pptist:depth-create]',
      'Built an editable two-slide seed library deck.',
    );
    await save();
    expect(doc().project.slides).toHaveLength(2);
    if (
      (await page
        .getByRole('button', { name: 'Toggle collaboration' })
        .getAttribute('aria-pressed')) === 'true'
    )
      await page.getByRole('button', { name: 'Toggle collaboration' }).click();
    const firstSlide = frame().locator('.thumbnail-item').first();
    await expect(async () => {
      await firstSlide.locator('.label').click();
      await expect(firstSlide).toHaveClass(/active/);
    }).toPass({ timeout: 10000 });
    const body = frame()
      .locator('.editable-element-text .ProseMirror')
      .filter({ hasText: 'Share local seeds.' })
      .first();
    await body.click();
    await body.evaluate((element) => {
      const selection = window.getSelection()!;
      selection.selectAllChildren(element);
      selection.collapseToEnd();
    });
    await body.press('Enter');
    await page.keyboard.type('Bring envelopes.');
    await save();
    const originalHeadline = doc().project.slides[0].elements[0].content;
    const manualBody = doc().project.slides[0].elements[1];
    expect(manualBody.content).toContain('Bring envelopes.');
    await expect(body).toContainText('Share local seeds. Grow something together.');
    await collaborator(
      page,
      'Change Friday to Saturday and keep my note [pptist:depth-revise]',
      'Moved the event to Saturday, preserved your note and exported PPTX.',
    );
    await save();
    expect(doc().project.slides[0].elements[1]).toEqual(manualBody);
    expect(doc().project.slides[0].elements[0].content).toBe(
      originalHeadline.replace('Friday', 'Saturday'),
    );
    await check();
    if (
      (await page
        .getByRole('button', { name: 'Toggle collaboration' })
        .getAttribute('aria-pressed')) === 'true'
    )
      await page.getByRole('button', { name: 'Toggle collaboration' }).click();
    // Use the actual editor history buttons, not a Garden-only undo command.
    await frame().locator('.canvas-tool .handler-item').nth(0).click();
    await expect.poll(() => JSON.stringify(doc().project.slides)).toContain('Friday');
    expect(doc().project.slides[0].elements[1]).toEqual(manualBody);
    await frame().locator('.canvas-tool .handler-item').nth(1).click();
    await expect.poll(() => JSON.stringify(doc().project.slides)).toContain('Saturday');
    await save();
    await page.screenshot({ path: join(evidence, 'native-editing.png') });
    await instance.app.close();

    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    await check();
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');

    instance = await launchApp();
    page = instance.page;
    await enterGarden(page);
    await importNativeCrux(page, archive);
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    await ready();
    await check();
    if (
      (await page
        .getByRole('button', { name: 'Toggle collaboration' })
        .getAttribute('aria-pressed')) === 'true'
    )
      await page.getByRole('button', { name: 'Toggle collaboration' }).click();
    await frame().locator('.thumbnail-item').first().locator('.label').click();
    await expect(frame().locator('.thumbnail-item').first()).toHaveClass(/active/);
    const importedBody = frame()
      .locator('.editable-element-text .ProseMirror')
      .filter({ hasText: 'Bring envelopes.' })
      .first();
    await importedBody.click();
    await importedBody.evaluate((element) => {
      const selection = window.getSelection()!;
      selection.selectAllChildren(element);
      selection.collapseToEnd();
    });
    await page.keyboard.type(' Keep a few for next year.');
    await save();
    expect(JSON.stringify(doc().project.slides)).toContain('Keep a few for next year.');
    await importedBody.click();
    await importedBody.evaluate((element) => {
      const selection = window.getSelection()!;
      selection.selectAllChildren(element);
      selection.collapseToEnd();
    });
    await page.keyboard.type(' Extra draft.');
    await frame().locator('.canvas-tool .handler-item').nth(0).click();
    await expect(importedBody).not.toContainText('Extra draft.');
    await expect(importedBody).toContainText('Keep a few for next year.');
    await frame().locator('.canvas-tool .handler-item').nth(1).click();
    await expect(importedBody).toContainText('Extra draft.');
    await save();
    await page.screenshot({ path: join(evidence, 'portable-editing.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
