import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { missions } from './missions.mjs';
const { chromium, expect } = createRequire(new URL('../../electron/package.json', import.meta.url))(
  '@playwright/test',
);

test('all lessons, missing outputs, journal persistence/restore and narrow layout', async () => {
  const files = new Map(
    ['index.html', 'style.css', 'app.mjs', 'missions.mjs', 'garden/practice-leaf.txt'].map(
      (path) => ['/' + path, readFileSync(new URL(path, import.meta.url))],
    ),
  );
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const data = files.get(path);
    res.writeHead(data ? 200 : 404, {
      'Content-Type': path.endsWith('.mjs')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : path.endsWith('.html')
            ? 'text/html'
            : 'application/octet-stream',
    });
    res.end(data ?? 'Missing');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.setViewportSize({ width: 1300, height: 650 });
    const trail = await page.locator('#trail').boundingBox();
    assert.ok(trail.y + trail.height <= 650, 'Garden and mission trail fit in a short Workshop');
    await page.setViewportSize({ width: 1300, height: 950 });
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      canvas.getContext('2d').fillRect(0, 0, 2, 2);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    for (let i = 0; i < missions.length; i++) {
      await page.getByRole('button', { name: new RegExp(`^${i + 1}\\.`) }).click();
      await page.getByRole('button', { name: 'Check my garden', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('#check').disabled);
      assert.match(await page.locator('#feedback').textContent(), /observations/);
      for (const check of missions[i].checks) {
        if (check.fields)
          files.set(
            '/' + check.path,
            Buffer.from(
              JSON.stringify(
                Object.fromEntries(
                  check.fields.map((field) => [
                    field,
                    field === 'color' ? '#aabbcc' : 'Fixture result',
                  ]),
                ),
              ),
            ),
          );
        else if (check.minText)
          files.set(
            '/' + check.path,
            Buffer.from(
              'Fixture notes from the simulated browser test.\nNot real cross-tool evidence.',
            ),
          );
        else if (check.png) files.set('/' + check.path, Buffer.from(png, 'base64'));
      }
      for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
      await page.getByRole('button', { name: 'Check my garden', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('#check').disabled);
      assert.match(await page.locator('#feedback').textContent(), /Files checked/);
    }
    assert.equal(await page.locator('#completion').textContent(), '6 / 6 milestones');
    await page.getByRole('button', { name: 'Field journal', exact: true }).click();
    await page
      .getByLabel('What happened? What would help?')
      .fill('Fixture observation — actual human fun still needs playtesting.');
    await page.getByRole('button', { name: 'Keep this observation' }).click();
    await page.getByLabel('Restore a saved journal').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":999}'),
    });
    await expect(page.locator('#journal-status')).toContainText('not a valid');
    assert.equal(await page.locator('#notes li').count(), 1);
    await page.reload();
    assert.equal(await page.locator('#completion').textContent(), '6 / 6 milestones');
    await page.getByRole('button', { name: 'Field journal', exact: true }).click();
    assert.equal(await page.locator('#notes li').count(), 1);
    await page.getByRole('button', { name: 'Close journal' }).click();
    await page.getByRole('button', { name: /^1\./ }).click();
    await page.screenshot({ path: '/tmp/crux-zen-desktop-view.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: '/tmp/crux-zen-mobile-view.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
