import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

// This tests Garden's companion with a fixture export. It is deliberately
// separate from the real MCP creative trial and never contacts Figma.
test('Figma companion saves its reference and imports an attributed asset', async () => {
  const instance = await launchApp();
  const { page } = instance;
  const evidence = resolve(__dirname, '../../docs/figma-companion');
  mkdirSync(evidence, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /Figma/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const companion = page.getByTestId('figma-companion');
    await expect(companion).toBeVisible();
    const folder = (await storedCrux(page, id)).projectFolder;
    const project = () => JSON.parse(readFileSync(join(folder, 'figma/project.json'), 'utf8'));
    expect((await storedCrux(page, id)).template).toBe('figma');
    await expect(
      companion.getByRole('button', { name: 'Import export', exact: true }),
    ).toBeDisabled();
    await companion
      .getByLabel('Figma file or frame link')
      .fill('https://example.com/design/Fixture123');
    await companion.getByRole('button', { name: 'Save link', exact: true }).click();
    await expect(companion.getByRole('alert')).toBeVisible();
    expect(project().documentUrl).toBeNull();
    await companion
      .getByLabel('Figma file or frame link')
      .fill('https://www.figma.com/design/Fixture123/Fixture?node-id=1-2&tracking=discard');
    await companion.getByRole('button', { name: 'Save link', exact: true }).click();
    await expect(companion.getByRole('status')).toHaveText('Figma link saved.');
    const canonical = 'https://www.figma.com/design/Fixture123?node-id=1-2';
    expect(project().documentUrl).toBe(canonical);
    await companion.getByLabel('Asset name', { exact: true }).fill('Fixture artwork');
    await companion.getByLabel('Choose Figma export', { exact: true }).setInputFiles({
      name: 'fixture.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#575ec7"/></svg>',
      ),
    });
    await expect(companion.getByRole('status')).toHaveText(
      'Imported Fixture artwork. It is available in Cruxspace assets.',
    );
    const output = readdirSync(join(folder, 'exports')).find((name) =>
      name.endsWith('.asset.json'),
    );
    expect(output).toBeTruthy();
    const descriptor = JSON.parse(readFileSync(join(folder, 'exports', output!), 'utf8'));
    expect(descriptor.externalSource).toEqual({
      app: 'figma',
      documentUrl: canonical,
      nodeId: '1:2',
      method: 'file-import',
    });
    await page.screenshot({ path: join(evidence, 'companion.png'), fullPage: true });
    await page.setViewportSize({ width: 420, height: 900 });
    await page.getByRole('button', { name: 'Workshop', exact: true }).click();
    await expect(companion).toBeVisible();
    const linkBounds = await companion.getByLabel('Figma file or frame link').boundingBox();
    expect(linkBounds!.x + linkBounds!.width).toBeLessThanOrEqual(420);
    await page.screenshot({ path: join(evidence, 'companion-narrow.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await instance.app.close();
  }
});
