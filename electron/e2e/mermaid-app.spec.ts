import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
test('Mermaid native editor, agent, SVG/PNG exports, conflict and restart', async () => {
  test.setTimeout(180000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/mermaid');
  mkdirSync(evidence, { recursive: true });
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = () => JSON.parse(doc().project.storage.codeStore);
  try {
    const { page } = first;
    page.on('pageerror', (e) => console.log('Mermaid error', e.message));
    await page.setViewportSize({ width: 1900, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Mermaid Live Editor/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Mermaid folder', folder);
    const editor = frame.locator('.monaco-editor [role=textbox]').first();
    async function edit(code: string) {
      await frame.locator('.monaco-editor .view-lines').first().click();
      await expect(editor).toBeFocused();
      await editor.press('Meta+A');
      await page.keyboard.insertText(code);
    }
    await frame.locator('.monaco-editor .view-lines').first().click();
    await expect(editor).toBeFocused();
    await editor.press('Meta+A');
    await editor.press('Backspace');
    await expect.poll(() => state().code).toBe('');
    await edit('flowchart LR\n  Ideas --> Garden');
    await expect.poll(() => state().code).toContain('Ideas --> Garden');
    await expect(frame.locator('#container svg')).toContainText('Garden');
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Draw this process [mermaid:diagram]');
    await chat.press('Enter');
    await expect.poll(() => state().code, { timeout: 45000 }).toContain('Research --> Create');
    await expect(frame.locator('#container svg')).toContainText('Research');
    await frame.getByRole('button', { name: 'History', exact: true }).click();
    await frame.locator('#saveHistory').click();
    await expect
      .poll(() => JSON.parse(doc().project.storage.manualHistoryStore || '[]').length)
      .toBe(1);
    await frame.getByRole('button', { name: 'History', exact: true }).click();
    await frame.getByText('Actions', { exact: true }).click();
    async function download(type: string) {
      const path = join(first.dir, 'diagram.' + type.toLowerCase());
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__mermaidDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__mermaidDownload = state;
          });
        });
      }, path);
      await frame.getByTestId('download-' + type).click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__mermaidDownload))
        .toBe('completed');
      return readFileSync(path);
    }
    expect((await download('SVG')).toString()).toContain('Research');
    expect((await download('PNG')).subarray(1, 4).toString()).toBe('PNG');
    const external = doc();
    const updated = state();
    updated.code = 'flowchart LR\n  External --> Diagram';
    external.project.storage.codeStore = JSON.stringify(updated);
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await edit('flowchart LR\n  Unsaved --> Draft');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(state().code).toContain('External --> Diagram');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await expect(frame.locator('#container svg')).toContainText('External');
    await page.screenshot({ path: join(evidence, 'mermaid-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.setViewportSize({ width: 1900, height: 1100 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    await expect(frame.locator('#container svg')).toContainText('External');
    await frame.getByRole('button', { name: 'History', exact: true }).click();
    await expect(frame.locator('#historyList li')).toHaveCount(1);
    await frame.getByTitle('Restore this version', { exact: true }).click();
    await expect(frame.locator('#container svg')).toContainText('Research');
    await expect.poll(() => state().code).toContain('Research --> Create');
    await frame.getByRole('button', { name: 'History', exact: true }).click();
    await second.page.screenshot({ path: join(evidence, 'mermaid-reopened.png') });
  } finally {
    await second.app.close();
  }
});
