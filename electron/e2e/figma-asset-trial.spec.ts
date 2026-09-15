import { test, expect, chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { home, member, open, exportCruxspacePackage } from './game-cruxspace-helpers';

// Explicit opt-in: this reuses the actual MCP export recorded in docs/figma-live.
// It tests transfer, not the model or an outbound Figma connection from Garden.
test('reuse the real Figma trial export in an Astro Cruxspace', async () => {
  test.skip(process.env.CRUX_FIGMA_ASSET_TRIAL !== '1', 'Run explicitly after the live MCP trial');
  test.setTimeout(10 * 60_000);
  const agentAsset = process.env.CRUX_FIGMA_AGENT_ASSET === '1';
  const source = resolve(__dirname, '../../docs/figma-live');
  const evidence = agentAsset ? join(source, 'agent-transfer') : source;
  const sourceNode = agentAsset ? '6:2' : '5:2';
  const inputPath = join(source, agentAsset ? 'figma-output.png' : 'garden-gathering.png');
  mkdirSync(evidence, { recursive: true });
  const bytes = readFileSync(inputPath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  expect(hash).toBe(
    agentAsset
      ? 'a9564ddaadb4e10308e1d595e9df241613ce0a7189a4ee07827498a2b17778e4'
      : 'a72ead5060ad224c866f02fee04c34550699060484b43e414385c9cde9054369',
  );
  const app = await launchApp();
  const { page } = app;
  try {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await enterGarden(page);
    const design = await member(page, /^Figma/, 'Garden gathering design');
    const companion = page.getByTestId('figma-companion');
    await companion
      .getByLabel('Figma file or frame link')
      .fill(
        `https://www.figma.com/design/1UGF8VTtWSz0D3pjGvOWwf?node-id=${sourceNode.replace(':', '-')}`,
      );
    await companion.getByRole('button', { name: 'Save link', exact: true }).click();
    await expect(companion.getByRole('status')).toHaveText('Figma link saved.');
    await companion.getByLabel('Asset name', { exact: true }).fill('Our shared garden artwork');
    await companion.getByLabel('Choose Figma export').setInputFiles(inputPath);
    await expect(companion.getByRole('status')).toContainText('Imported Our shared garden artwork');
    writeFileSync(
      join(design.folder, 'brief.md'),
      `# Garden gathering\n\nCreate an editable event artwork in Figma, preserve Daniel’s change from SATURDAY to EDITED, and reuse the returned image on our Astro site.\n\nThe live MCP edits were made through ${agentAsset ? 'Garden’s Claude Code Collaboration provider, which uploaded a local SVG and downloaded the completed MCP-rendered image' : 'Codex'}. Garden registers the returned image as a Cruxspace output using its companion.\n`,
    );
    await page.screenshot({ path: join(evidence, 'garden-companion.png'), fullPage: true });
    const nativeStatus = await page.evaluate(() => window.electronAPI?.figmaDesktop?.status());
    writeFileSync(join(evidence, 'native-status.json'), JSON.stringify(nativeStatus, null, 2));
    const site = await member(page, /Astro Home Page/, 'Garden gathering site');
    writeFileSync(
      join(site.folder, 'src/pages/gathering.astro'),
      `---
---
<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Made together — Garden gathering</title>
<style>body{margin:0;background:#f6f3e8;color:#1f4030;font-family:system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:60px 32px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #c7cdbf;padding-bottom:24px}h1{font-size:40px;letter-spacing:-1.5px;margin:36px 0 12px}p{font-size:18px;line-height:1.6;max-width:760px}img{display:block;width:100%;height:auto;margin:32px 0;border:1px solid #d9ddcf;border-radius:12px}a{color:inherit}small{font-size:14px}</style></head>
<body><main><header><strong>NEIGHBOURHOOD GARDEN</strong><span>Made together</span></header><h1>A little room to grow.</h1><p>Daniel edited the event details directly in Figma. The collaborator preserved that change in a second layout, then brought the artwork into this Astro page through our Cruxspace.</p><img src="/garden-gathering.png" alt="Shared garden artwork with Daniel’s EDITED event text"/><small>Editable source: <a href="https://www.figma.com/design/1UGF8VTtWSz0D3pjGvOWwf?node-id=${sourceNode.replace(':', '-')}">Figma design</a> · Imported into Crux Garden</small></main></body></html>`,
    );
    await home(page);
    await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
    await page.getByLabel('Cruxspace name').fill('Made together — Figma to Astro');
    await page
      .getByLabel('Shared brief')
      .fill(
        'An editable Figma artwork becomes an Astro page while preserving a person’s contribution.',
      );
    await page.getByRole('checkbox', { name: design.title, exact: true }).check();
    await page.getByRole('checkbox', { name: site.title, exact: true }).check();
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
    await page.screenshot({ path: join(evidence, 'cruxspace.png'), fullPage: true });
    await open(page, site.title);
    await page.getByRole('button', { name: 'Cruxspace assets', exact: true }).click();
    await page.getByRole('button', { name: 'Use Our shared garden artwork', exact: true }).click();
    await page.getByLabel('Destination path').fill('public/garden-gathering.png');
    await page.getByRole('button', { name: 'Copy selected version', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Copied Our shared garden artwork' }),
    ).toBeVisible();
    expect(readFileSync(join(site.folder, 'public/garden-gathering.png')).equals(bytes)).toBe(true);
    const originName = readdirSync(join(site.folder, 'cruxspace-assets')).find((name) =>
      name.endsWith('.json'),
    )!;
    const origin = JSON.parse(
      readFileSync(join(site.folder, 'cruxspace-assets', originName), 'utf8'),
    );
    expect(origin.externalSource).toMatchObject({
      app: 'figma',
      nodeId: sourceNode,
      method: 'file-import',
    });
    await page.keyboard.press('Escape');
    const toggle = page.getByRole('button', { name: 'Toggle workshop' });
    if (!(await page.getByTestId('workshop-view').isVisible())) await toggle.click();
    await page.getByRole('button', { name: 'Clean', exact: true }).click();
    const preview = page.locator('iframe[src^="http://127.0.0.1"]');
    await expect(preview).toBeVisible({ timeout: 240000 });
    const url = new URL('/gathering', (await preview.getAttribute('src'))!).toString();
    const browser = await chromium.launch();
    try {
      const rendered = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
      await rendered.goto(url);
      await expect(rendered.getByRole('heading', { name: 'A little room to grow.' })).toBeVisible();
      await expect
        .poll(() =>
          rendered
            .getByRole('img', { name: 'Shared garden artwork with Daniel’s EDITED event text' })
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBe(960);
      const response = await rendered.request.get(new URL('/garden-gathering.png', url).toString());
      expect((await response.body()).equals(bytes)).toBe(true);
      await rendered.screenshot({ path: join(evidence, 'astro-page.png'), fullPage: true });
    } finally {
      await browser.close();
    }
    await home(page);
    await exportCruxspacePackage(
      page,
      app.app,
      'Made together — Figma to Astro',
      join(evidence, 'figma-to-astro.cruxspace'),
    );
    writeFileSync(
      join(evidence, 'transfer.json'),
      JSON.stringify(
        {
          sha256: hash,
          sourceNode,
          importedThrough: 'Figma companion file import',
          transfer: origin,
          designId: design.id,
          siteId: site.id,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.app.close();
  }
});
