import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import {
  home,
  member,
  open,
  nativeReady,
  collaborator,
  outputs,
  importPiskelArt,
  tone,
  exportCruxspacePackage,
  importCruxspacePackage,
} from './game-cruxspace-helpers';

const evidence = resolve(__dirname, '../../docs/creative-game');
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

// Real Garden-agent Figma/Blender outputs; deterministic receiving-game recipe.
// This does not claim the mocked game author is a real model.
test('Figma artwork and Blender collectible join Piskel and AudioMass in a portable native game', async () => {
  test.skip(
    process.env.CRUX_CREATIVE_GAME_TRIAL !== '1',
    'Explicit retained-assets integration trial',
  );
  test.setTimeout(20 * 60_000);
  mkdirSync(evidence, { recursive: true });
  const resume = process.env.CRUX_CREATIVE_GAME_RESUME
    ? JSON.parse(readFileSync(process.env.CRUX_CREATIVE_GAME_RESUME, 'utf8'))
    : null;
  const first = await launchApp({
    ...(resume ? { dir: resume.dir } : {}),
    env: { CRUX_AI_MOCK: '1' },
  });
  const { page } = first;
  const members: Record<string, { id: string; folder: string; title: string }> =
    resume?.members ?? {};
  const packagePath = join(evidence, 'shared-garden.cruxspace');
  const input = resolve(__dirname, '../../docs/blender-live');
  const figmaImage = resolve(__dirname, '../../docs/figma-live/figma-output.png');
  const errors: string[] = [];
  const listen = (p: Page) => p.on('pageerror', (error) => errors.push(error.message));
  const run = async (stage: string) => {
    await collaborator(
      page,
      `Continue our game [creative-game:${stage}]`,
      `Creative game ${stage} complete.`,
    );
    await nativeReady(page);
    const calls = await page.evaluate(async (owner) => {
      const rows = (await window.electronAPI!.sqlite.all(
        "SELECT meta FROM cruxes WHERE id = ? OR id IN (SELECT target_id FROM dimensions WHERE source_id = ? AND type = 'growth')",
        [owner, owner],
      )) as { meta: string }[];
      return rows.flatMap((row) =>
        (JSON.parse(row.meta).messages ?? []).flatMap(
          (message: { toolCalls?: { name: string; result?: string }[] }) => message.toolCalls ?? [],
        ),
      );
    }, members.game.id);
    writeFileSync(join(evidence, 'game-calls.json'), JSON.stringify(calls, null, 2));
    expect(
      calls.filter((call) => call.result?.startsWith('Error')),
      'No scripted game operation may silently fail',
    ).toEqual([]);
  };
  const play = async (p: Page, stage: string) => {
    const f = await nativeReady(p);
    await f.locator('#toolbar-preview-button').click();
    await expect(f.frameLocator('#garden-game-preview iframe').locator('canvas')).toBeVisible({
      timeout: 60000,
    });
    const game = p.frames().find((frame) => frame.url().includes('/preview/index.html'))!;
    await game.evaluate(() =>
      (window as any).gdjs.registerRuntimeScenePreEventsCallback((scene: any) => {
        (window as any).__observedScene = scene;
      }),
    );
    await expect
      .poll(
        () =>
          game.evaluate(() => {
            const object = (window as any).__observedScene?.getObjects('Sprout')[0];
            let meshes = 0;
            object?.get3DRendererObject()?.traverse((node: any) => {
              if (node.isMesh) meshes++;
            });
            return meshes;
          }),
        { timeout: 60000 },
      )
      .toBe(8);
    await expect
      .poll(() => game.evaluate(() => (window as any).__observedScene?.getObjects('Sprout').length))
      .toBe(3);
    await p.screenshot({ path: join(evidence, stage + '-playing.png') });
    await game.locator('canvas').click();
    const alignment = await game.evaluate(() => {
      const scene = (window as any).__observedScene;
      const player = scene.getObjects('Gardener')[0];
      const prop = scene.getObjects('Sprout')[0];
      return {
        player: player.getAABB(),
        prop: prop.getAABB(),
        playerY: player.getAABBCenterY(),
        targetY: prop.getAABBCenterY(),
        startX: player.getX(),
      };
    });
    writeFileSync(join(evidence, stage + '-input.json'), JSON.stringify(alignment, null, 2));
    const up = alignment.playerY > alignment.targetY;
    if (Math.abs(alignment.playerY - alignment.targetY) > 3) {
      const key = up ? 'ArrowUp' : 'ArrowDown';
      await p.keyboard.down(key);
      try {
        await expect
          .poll(
            () =>
              game.evaluate(() =>
                (window as any).__observedScene.getObjects('Gardener')[0].getAABBCenterY(),
              ),
            { timeout: 5000, intervals: [16] },
          )
          [up ? 'toBeLessThanOrEqual' : 'toBeGreaterThanOrEqual'](alignment.targetY);
      } finally {
        await p.keyboard.up(key);
      }
    }
    await p.keyboard.down('ArrowRight');
    try {
      await expect
        .poll(
          () => game.evaluate(() => (window as any).__observedScene.getObjects('Sprout').length),
          { timeout: 10000 },
        )
        .toBe(0);
    } finally {
      await p.keyboard.up('ArrowRight');
    }
    await expect
      .poll(() =>
        game.evaluate(() => (window as any).__observedScene.getObjects('Score')[0].getString()),
      )
      .toContain('3/3');
    await p.screenshot({ path: join(evidence, stage + '-collected.png') });
    await f.getByRole('button', { name: 'Close game preview', exact: true }).click();
  };
  try {
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    listen(page);
    if (resume) {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.goto(new URL('/c/' + members.game.id, page.url()).toString());
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
        'data-workspace-id',
        members.game.id,
      );
    } else {
      await enterGarden(page);
      members.design = await member(page, /^Figma/, 'Shared garden design');
      const figma = page.getByTestId('figma-companion');
      await figma
        .getByLabel('Figma file or frame link')
        .fill('https://www.figma.com/design/1UGF8VTtWSz0D3pjGvOWwf?node-id=6-2');
      await figma.getByRole('button', { name: 'Save link', exact: true }).click();
      await expect(figma.getByRole('status')).toHaveText('Figma link saved.');
      await figma.getByLabel('Asset name', { exact: true }).fill('Figma garden artwork');
      await figma.getByLabel('Choose Figma export').setInputFiles(figmaImage);
      await expect(figma.getByRole('status')).toContainText('Imported Figma garden artwork');
      members.model = await member(page, /^Blender/, 'Shared garden model');
      for (const name of ['scene.blend', 'sprout.glb', 'sprout.png'])
        copyFileSync(join(input, name), join(members.model.folder, name));
      writeFileSync(
        join(members.model.folder, 'brief.md'),
        '# Shared garden prop\n\nThese are the actual scene and exports created by the Garden Claude Code Blender trial, reused unchanged for this receiving-game integration. The original live conversation is retained separately in the trial evidence; this imported source Crux does not pretend to contain that conversation. Keep the editable scene and its materials.\n',
      );
      const blender = page.getByTestId('blender-companion');
      await expect(
        blender.getByText('scene.blend is saved in Artifacts.', { exact: false }),
      ).toBeVisible();
      await expect(
        blender.getByLabel('Saved Artifact').locator('option').filter({ hasText: 'sprout.glb' }),
      ).toHaveCount(1);
      await blender.getByLabel('Saved Artifact').selectOption({ label: 'sprout.glb' });
      await blender.getByLabel('Output name').fill('Blender sprout');
      await blender.getByRole('button', { name: 'Save output', exact: true }).click();
      await expect(blender.getByRole('status')).toHaveText('Output saved for your Cruxspace.');
      await blender.getByLabel('Saved Artifact').selectOption({ label: 'sprout.png' });
      await blender.getByLabel('Output name').fill('Blender sprout render');
      await blender.getByRole('button', { name: 'Save output', exact: true }).click();
      await expect
        .poll(() => outputs(members.model.folder).map((output) => output.label))
        .toContain('Blender sprout render');
      members.sprites = await member(page, /^Piskel/, 'Shared garden sprites');
      const piskel = await nativeReady(page);
      await importPiskelArt(
        page,
        piskel,
        resolve(__dirname, 'fixtures/glow-garden/gardener-sheet.png'),
        { width: 32, height: 32 },
      );
      await collaborator(
        page,
        'Share the walk cycle [game:sprite]',
        'Set the walk speed and saved the sheet to the Cruxspace.',
      );
      members.sound = await member(page, /^AudioMass/, 'Shared garden sound');
      const audio = await nativeReady(page);
      const welcome = audio.locator('.pk_modal');
      if (await welcome.count()) await welcome.getByText('OK', { exact: true }).click();
      await audio.getByText('File', { exact: true }).first().click();
      const chooser = page.waitForEvent('filechooser');
      await audio.getByText('Load from Computer', { exact: true }).click();
      const chime = join(first.dir, 'chime.wav');
      writeFileSync(chime, tone());
      await (await chooser).setFiles(chime);
      await expect
        .poll(
          () =>
            !!JSON.parse(readFileSync(join(members.sound.folder, 'data/project.json'), 'utf8'))
              .project?.waveform,
        )
        .toBe(true);
      await collaborator(page, 'Share the sound [game:sound]', 'Saved the chime to the Cruxspace.');
      members.game = await member(page, /^GDevelop/, 'Shared garden game', 240000);
      await nativeReady(page);
      members.site = await member(page, /^Empty \(Astro\)/, 'Shared garden site');
      await home(page);
      await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
      await page.getByLabel('Cruxspace name').fill('Shared garden');
      await page
        .getByLabel('Shared brief')
        .fill(
          'Figma artwork and Blender props join Piskel animation and AudioMass sound in a native GDevelop game. This focused integration uses actual Garden-agent art and a scripted game recipe; the full demo also retains Notes, Kan and Astro.',
        );
      for (const m of Object.values(members))
        await page.getByRole('checkbox', { name: m.title, exact: true }).check();
      await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
      await open(page, members.game.title);
      writeFileSync(
        join(evidence, 'workspace.json'),
        JSON.stringify({ dir: first.dir, members }, null, 2),
      );
      for (const stage of ['assets', 'model', 'art', 'play']) {
        console.log('Creative game stage:', stage);
        await run(stage);
      }
    }
    expect(hash(join(members.game.folder, 'assets/sprout.glb'))).toBe(
      hash(join(input, 'sprout.glb')),
    );
    expect(hash(join(members.game.folder, 'assets/title.png'))).toBe(hash(figmaImage));
    const receipts = readdirSync(join(members.game.folder, 'cruxspace-assets'))
      .filter((name) => name.endsWith('.json'))
      .map((name) =>
        JSON.parse(readFileSync(join(members.game.folder, 'cruxspace-assets', name), 'utf8')),
      );
    expect(
      receipts.some(
        (row) =>
          row.externalSource?.app === 'blender' &&
          row.externalSource.sceneFingerprint === hash(join(input, 'scene.blend')),
      ),
    ).toBe(true);
    expect(
      receipts.some(
        (row) => row.externalSource?.app === 'figma' && row.externalSource.nodeId === '6:2',
      ),
    ).toBe(true);
    writeFileSync(join(evidence, 'transfers.json'), JSON.stringify(receipts, null, 2));
    await play(page, 'native');
    await run('export');
    expect(
      outputs(members.game.folder).some((output) => output.mimeType === 'application/zip'),
    ).toBe(true);
    await open(page, members.site.title);
    await collaborator(
      page,
      'Build our launch page [creative-game:site]',
      'Creative game site complete.',
    );
    expect(hash(join(members.site.folder, 'public/garden-artwork.png'))).toBe(hash(figmaImage));
    expect(hash(join(members.site.folder, 'public/sprout.png'))).toBe(
      hash(join(input, 'sprout.png')),
    );
    const preview = page.locator('iframe[src^="http://127.0.0.1"]');
    const workshop = page.getByRole('button', { name: 'Toggle workshop' });
    if ((await workshop.getAttribute('aria-pressed')) !== 'true') await workshop.click();
    await expect(preview).toBeVisible({ timeout: 240000 });
    const url = new URL('/play', (await preview.getAttribute('src'))!).toString();
    const browser = await chromium.launch();
    try {
      const site = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
      listen(site);
      await site.goto(url);
      await expect(site.getByRole('heading', { name: 'Collect the garden' })).toBeVisible();
      await expect(
        site.frameLocator('iframe[title="Shared garden game"]').locator('canvas'),
      ).toBeVisible({ timeout: 60000 });
      await site.screenshot({ path: join(evidence, 'astro-launch-page.png'), fullPage: true });
    } finally {
      await browser.close();
    }
    await exportCruxspacePackage(page, first.app, 'Shared garden', packagePath);
    writeFileSync(
      join(evidence, 'workspace.json'),
      JSON.stringify({ dir: first.dir, members }, null, 2),
    );
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    listen(second.page);
    await second.page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(second.page);
    await importCruxspacePackage(second.page, packagePath);
    await open(second.page, members.model.title);
    const modelId = (await second.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    const modelFolder = (await storedCrux(second.page, modelId)).projectFolder as string;
    expect(modelFolder).not.toBe(members.model.folder);
    expect(hash(join(modelFolder, 'scene.blend'))).toBe(hash(join(input, 'scene.blend')));
    await open(second.page, members.game.title);
    await play(second.page, 'restored');
    expect(errors).toEqual([]);
  } finally {
    await second.app.close();
  }
});
