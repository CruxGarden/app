import { test, expect, chromium, type Page } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { openBuilder } from './builder-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

const postPath = 'src/content/blog/compost.md';
const initial = `---
title: Compost
description: A neighbourhood garden gathering.
publishDate: 2026-09-14T12:00:00Z
tags: [garden]
---

Our first draft.

Bring your own gloves.
`;

test('Astro collaboration preserves manual edits, recovers changed passages and failed builds, and continues after import', async () => {
  test.setTimeout(20 * 60_000);
  const evidence = resolve(__dirname, '../../docs/homepage-collaboration');
  mkdirSync(evidence, { recursive: true });
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const originalDir = instance.dir;
  const archive = join(originalDir, 'shared-home.crux');
  let folder = '';
  let id = '';
  const calls: any[] = [];
  const errors: string[] = [];
  const editorCancellations: string[] = [];
  const content = () => readFileSync(join(folder, postPath), 'utf8');
  const watch = () =>
    instance.page.on('pageerror', (error) => {
      const detail = error.stack || error.message;
      // Monaco cancels its pending editor work when code view is disposed.
      // Retain these separately; do not hide other editor/application errors.
      if (
        /^(Uncaught \(in promise\) )?Canceled: Canceled/.test(detail) &&
        detail.includes('monaco-editor@') &&
        detail.includes('at dispose')
      ) {
        editorCancellations.push(detail);
      } else errors.push(detail);
    });
  const identify = async () => {
    const page = instance.page;
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
    id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
  };
  const savePost = async (text: string) => {
    const page = instance.page;
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText(text);
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(content, { timeout: 30000 }).toBe(text);
  };
  const collaborate = async (
    scenario: string,
    expectedCalls: number,
    manual?: () => Promise<void>,
  ) => {
    const page = instance.page;
    const before = new Set((await storedCrux(page, id)).messages.map((m: any) => m.timestamp));
    await page.evaluate(() => {
      (window as any).__homeHandoffPaused = false;
      window.addEventListener(
        'crux:mock-pause',
        () => {
          (window as any).__homeHandoffPaused = true;
        },
        { once: true },
      );
    });
    const toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    await page
      .getByPlaceholder('Send a message...')
      .fill('Continue our home page [home:collaborate-' + scenario + ']');
    await page.getByPlaceholder('Send a message...').press('Enter');
    if (manual) {
      await page.waitForFunction(() => (window as any).__homeHandoffPaused === true);
      try {
        await manual();
      } finally {
        await page.evaluate(() => window.dispatchEvent(new Event('crux:mock-continue')));
      }
    }
    const closing = 'Home collaboration ' + scenario + ' complete.';
    await expect
      .poll(
        async () =>
          (await storedCrux(page, id)).messages.some(
            (m: any) => !before.has(m.timestamp) && m.content === closing,
          ),
        { timeout: 8 * 60_000 },
      )
      .toBe(true);
    const current = (await storedCrux(page, id)).messages
      .filter((m: any) => !before.has(m.timestamp) && m.content === closing)
      .flatMap((m: any) => m.toolCalls ?? []);
    expect(current).toHaveLength(expectedCalls);
    calls.push(...current);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0, {
      timeout: 8 * 60_000,
    });
    return current;
  };
  const previewPost = async (page: Page, filename: string, expected: string) => {
    const previewButton = page.getByRole('button', { name: 'Preview', exact: true });
    // Imported Cruxes can reopen with only Collaboration visible. Do not
    // toggle an already open Builder, which would close its editor toolbar.
    if (!(await previewButton.isVisible())) {
      await openBuilder(page);
      await page.getByRole('button', { name: /^Compost/ }).click();
    }
    await previewButton.click();
    const preview = page.locator('iframe[src^="http://127.0.0.1"]');
    await expect(preview).toBeVisible({ timeout: 8 * 60_000 });
    const url = new URL('/blog/compost/', (await preview.getAttribute('src'))!).toString();
    const browser = await chromium.launch();
    try {
      const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      // Saving the source precedes Astro's asynchronous content-loader update.
      // A fresh browser can load the old route before its HMR socket connects.
      await expect
        .poll(
          async () => {
            const response = await site.request.get(url);
            return response.ok() && (await response.text()).includes(expected);
          },
          { timeout: 60000, message: 'The live route never reflected the saved post' },
        )
        .toBe(true);
      await site.goto(url);
      await expect(site.getByRole('heading', { name: 'Compost', exact: true })).toBeVisible();
      await expect(site.getByText(expected, { exact: true })).toBeVisible();
      await expect(site.getByText('A note from Alex.', { exact: true })).toBeVisible();
      await site.screenshot({ path: join(evidence, filename), fullPage: true });
    } finally {
      await browser.close();
    }
  };
  try {
    watch();
    const page = instance.page;
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /Astro Home Page/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await identify();
    await openBuilder(page);
    await page
      .getByRole('button', { name: /new post/i })
      .first()
      .click();
    await page.getByPlaceholder('Post title').fill('Compost');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => existsSync(join(folder, postPath))).toBe(true);
    await savePost(initial);
    const manual = initial.replace('[garden]', '[garden, community]') + '\nA note from Alex.\n';
    const revised = await collaborate('revise', 2, () => savePost(manual));
    expect(revised.every((c: any) => !c.result.startsWith('Error'))).toBe(true);
    expect(content()).toBe(manual.replace('Our first draft.', 'We meet on Saturday.'));
    const changed = content().replace('Saturday', 'Sunday');
    const recovered = await collaborate('changed', 4, () => savePost(changed));
    expect(recovered[1].result).toContain('old_string not found');
    expect(recovered[2].result).toBe(changed);
    expect(recovered[3].result).toBe('Edited file: ' + postPath);
    expect(content()).toBe(changed.replace('We meet on Sunday.', 'We meet at noon on Sunday.'));
    await page.screenshot({ path: join(evidence, 'manual-agent-handoff.png') });
    const beforeBroken = content();
    await savePost(
      beforeBroken.replace('publishDate: 2026-09-14T12:00:00Z', 'publishDate: not-a-date'),
    );
    const repaired = await collaborate('repair', 4);
    expect(repaired[0].result).toContain('Build FAILED');
    expect(repaired[0].result).toMatch(/compost|publishDate/);
    expect(repaired[3].result).toContain('Build passed');
    expect(content()).toBe(beforeBroken);
    const manualAfter = content() + '\nWe will make this together.\n';
    await savePost(manualAfter);
    await previewPost(page, 'live-post.png', 'We will make this together.');
    await instance.app.close();
    instance = await launchApp({ dir: originalDir });
    watch();
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await identify();
    expect(content()).toBe(manualAfter);
    await exportNativeCrux(instance.page, archive, instance.app, async () => {
      await instance.page.getByRole('button', { name: 'Toggle export' }).click();
      await instance.page.getByRole('button', { name: 'Export Crux', exact: true }).click();
    });
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    watch();
    await instance.page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(instance.page);
    await importNativeCrux(instance.page, archive);
    await identify();
    expect(content()).toBe(manualAfter);
    expect(existsSync(join(folder, 'node_modules'))).toBe(false);
    const continued = await collaborate('continue', 2);
    expect(continued.every((c: any) => !c.result.startsWith('Error'))).toBe(true);
    expect(content()).toBe(
      manualAfter.replace('Bring your own gloves.', 'Bring your own gloves and a reusable cup.'),
    );
    await previewPost(
      instance.page,
      'imported-post.png',
      'Bring your own gloves and a reusable cup.',
    );
    writeFileSync(join(evidence, 'calls.json'), JSON.stringify(calls, null, 2));
    writeFileSync(join(evidence, 'compost.md'), content());
    writeFileSync(
      join(evidence, 'editor-cancellations.json'),
      JSON.stringify(editorCancellations, null, 2),
    );
    expect(errors).toEqual([]);
  } finally {
    await instance.app.close();
  }
});
