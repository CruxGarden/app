import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Garden agent edits a disposable Penpot design and brings its real SVG back', async () => {
  test.skip(process.env.CRUX_LIVE_PENPOT !== '1', 'Opt-in native design mutation and real agent');
  test.setTimeout(240_000);
  const fileId = process.env.CRUX_PENPOT_FILE_ID;
  const pageId = process.env.CRUX_PENPOT_PAGE_ID;
  const configPath = process.env.CRUX_PENPOT_CONFIG;
  const provider = process.env.CRUX_PENPOT_PROVIDER ?? 'codex';
  expect(['codex', 'claude-code']).toContain(provider);
  const resumeDir = process.env.CRUX_PENPOT_RESUME_DIR;
  const resumeCrux = process.env.CRUX_PENPOT_RESUME_CRUX;
  if (resumeDir) expect(resumeCrux).toBeTruthy();
  expect(fileId && pageId && configPath).toBeTruthy();
  const connection = JSON.parse(readFileSync(configPath!, 'utf8')).mcpServers.penpot;
  const client = new Client({ name: 'crux-garden-penpot-verifier', version: '0.1' });
  const { app, page, dir } = await launchApp({
    dir: resumeDir,
    env: { CRUX_AI_MOCK: '1' },
  });
  console.log(`Penpot live evidence profile: ${dir}`);
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(connection.url)));
    const identity = await client.callTool({
      name: 'execute_code',
      arguments: {
        code: 'return { fileId: penpot.currentFile?.id, pageId: penpot.currentPage?.id };',
      },
    });
    expect(JSON.stringify(identity)).toContain(fileId!);
    expect(JSON.stringify(identity)).toContain(pageId!);
    if (resumeDir) {
      // Verify retained output/history without paying for another authoring turn.
      await page.getByRole('button', { name: /enter/i }).click();
      await page.goto(new URL(`/c/${resumeCrux}`, page.url()).toString());
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
    } else {
      await enterGarden(page);
      await createCrux(page, 'Penpot connection proof');
      const chat = page.getByTestId('pane-body-collaboration');
      if (!(await chat.isVisible()))
        await page.getByRole('button', { name: 'Toggle collaboration' }).click();
      await chat.getByTestId('model-selector').click();
      await page
        .getByTestId(`model-group-${provider}`)
        .getByRole('button', { name: provider === 'codex' ? 'Codex' : 'Claude Code' })
        .click();
      const composer = page.getByPlaceholder('Send a message...');
      await composer.fill(
        `This is an authorized integration check in the disposable Penpot file "Garden connection test — disposable", not Lava Flower artwork. Use only Penpot MCP and Garden tools. Before EVERY Penpot write or export, assert penpot.currentFile.id === ${JSON.stringify(fileId)} and penpot.currentPage.id === ${JSON.stringify(pageId)}; stop if either differs. Inspect this page, then create one rectangle named "Garden MCP proof" at x=40,y=40, resize(240,160), fills=[{fillColor:"#88CC99",fillOpacity:1}], borderRadius=24. Preserve every other shape. If a shape with that name already exists, reuse it without changing other shapes. Obtain the ACTUAL SVG bytes using await shape.export({type:"svg"}); return their decoded UTF-8 text through execute_code (TextDecoder or byte-to-character decoding). Do not fabricate SVG. Discover Garden write_file and save that exact returned SVG as penpot-proof.svg. Save penpot-reference.json with fileId, pageId, shapeId and the shape name; never read or save connection credentials. Do not use shell, other MCP servers, publish or change other files. End your response with PENPOT_GARDEN_READY only after both Garden writes succeed.`,
      );
      await composer.press('Enter');
      await expect(chat.locator('p').filter({ hasText: /PENPOT_GARDEN_READY$/ })).toBeVisible({
        timeout: 180_000,
      });
      await expect(chat.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    }
    const garden = join(dir, 'garden');
    const folder = readdirSync(garden).find((name) =>
      existsSync(join(garden, name, 'penpot-proof.svg')),
    );
    expect(folder).toBeTruthy();
    const svg = readFileSync(join(garden, folder!, 'penpot-proof.svg'), 'utf8');
    expect(svg).toContain('<svg');
    const reference = JSON.parse(
      readFileSync(join(garden, folder!, 'penpot-reference.json'), 'utf8'),
    );
    expect(reference).toMatchObject({ fileId, pageId });
    expect(reference.shapeName ?? reference.name).toBe('Garden MCP proof');
    expect(svg).toContain(reference.shapeId);
    const native = await client.callTool({
      name: 'execute_code',
      arguments: {
        code: `if(penpot.currentFile?.id!==${JSON.stringify(fileId)}||penpot.currentPage?.id!==${JSON.stringify(pageId)})throw new Error("Wrong document"); const shapes=penpot.currentPage.findShapes({name:"Garden MCP proof"}); if(shapes.length!==1)throw new Error("Expected one test shape"); const bytes=await shapes[0].export({type:"svg"}); return {shapes:shapes.map(s=>({id:s.id,name:s.name,width:s.width,height:s.height})),svg:String.fromCharCode(...bytes)};`,
      },
    });
    expect(JSON.stringify(native)).toContain(reference.shapeId);
    expect(JSON.stringify(native)).toContain('240');
    const content = native.content as { type: string; text?: string }[];
    const readback = JSON.parse(content.find((part) => part.type === 'text')!.text!).result;
    expect(readback.svg.trim()).toBe(svg.trim());
    await page.getByRole('button', { name: 'Toggle history' }).click();
    await expect(page.getByTestId('pane-body-history')).toBeVisible();
    await expect(page.getByTestId('pane-body-history').getByText('No snapshots yet')).toHaveCount(
      0,
    );
    const evidence = join(dir, 'penpot-evidence');
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, 'native-shape.json'), JSON.stringify(native, null, 2));
    await page.screenshot({ path: join(evidence, 'garden-penpot.png') });
  } finally {
    await page.screenshot({ path: join(dir, 'penpot-last.png') }).catch(() => {});
    await client.close().catch(() => {});
    await app.close();
  }
});
