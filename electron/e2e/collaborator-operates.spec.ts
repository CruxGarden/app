import { test, expect } from '@playwright/test';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * The crux collaborator operates its own workspace (the parity rule, step
 * 10): a scripted turn opens History, shows index.html in the Workshop and
 * runs functions/hello.js here with test_function — the person watches each
 * one land, and the tool's trail carries the function's answer.
 */
test('the collaborator shows its work and tests a function in its crux', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const trail: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[workspace-tool]')) trail.push(m.text());
  });
  try {
    await enterGarden(page);
    await createCrux(page, 'Backend');
    const garden = join(dir, 'garden');
    const folder = join(garden, readdirSync(garden)[0]!);
    mkdirSync(join(folder, 'functions'), { recursive: true });
    writeFileSync(join(folder, 'index.html'), '<h1>Backend</h1>\n');
    writeFileSync(
      join(folder, 'functions', 'hello.js'),
      'export default async function (req, ctx) { const b = await req.json(); ctx.log("seen", b); return ctx.json({ ok: true, echo: b }); }\n',
    );
    await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    await expect(page.getByRole('tree').getByText('index.html', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('tree').getByText('functions', { exact: true })).toBeVisible();

    const input = page.getByPlaceholder('Send a message...');
    await input.fill('[crux:operate] Show me and test hello.');
    await input.press('Enter');
    await expect(page.getByText('hello answered with the echo')).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId('pane-body-history')).toBeVisible();
    await expect(page.getByTestId('pane-body-workshop')).toContainText('index.html');
    const log = trail.join('\n');
    expect(log).toContain('[workspace-tool] show Opened the History pane.');
    expect(log).toContain('[workspace-tool] show Showing index.html in the Workshop.');
    const tested = trail.find((l) => l.startsWith('[workspace-tool] test_function'));
    expect(tested).toMatch(/functions\/hello\.js answered 200 in \d+ ms/);
    expect(tested).toContain('"ok": true');
    expect(tested).toContain('"n": 7');
    await page.screenshot({ path: 'e2e/.results/collaborator-operates.png' });
  } finally {
    await app.close();
  }
});
