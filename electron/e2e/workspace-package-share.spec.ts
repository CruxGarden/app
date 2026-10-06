import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { enterGarden, goHome, storedCrux, storedFingerprint } from './multi-crux-helpers';
import { newGarden, goToGarden } from './journeys/journey-helpers';
import { openPanel } from './panel-helpers';

type DownloadState = typeof globalThis & {
  packageDownloads?: { filename: string; state: string }[];
};

async function captureDownloads(app: ElectronApplication, files: Record<string, string>) {
  await app.evaluate(({ session }, files) => {
    const state = globalThis as DownloadState;
    state.packageDownloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const filename = item.getFilename();
      const record = { filename, state: 'started' };
      state.packageDownloads!.push(record);
      const destination = files[filename.endsWith('.cruxspace') ? 'garden' : 'crux'];
      if (destination) item.setSavePath(destination);
      item.once('done', (_event, result) => {
        record.state = result;
      });
    });
  }, files);
}

async function downloads(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as DownloadState).packageDownloads ?? []);
}

async function addTool(page: Page, name: 'Stack' | 'Runner' | 'Link', title: string) {
  await goHome(page);
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Crux', exact: true });
  await dialog.getByLabel('Find a starting point').fill(name);
  await dialog.locator(`[data-template-id="${name.toLowerCase()}-app"]`).click();
  await dialog
    .getByPlaceholder(name === 'Runner' ? 'My workspace' : `My ${name.toLowerCase()}`)
    .fill(title);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('iframe[data-crux-id]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(title);
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}

async function savedFile(page: Page, id: string, path: string, content: string) {
  const folder = (await storedCrux(page, id)).projectFolder as string;
  // A real external editor writes the configuration; wait for native ingestion
  // so export must carry the selected saved bytes, rather than a test-only copy.
  writeFileSync(join(folder, path), content);
  await expect
    .poll(() => storedFingerprint(page, id, path))
    .toBe(createHash('sha256').update(content).digest('hex'));
  return folder;
}

test('Stack and Runner share reviewed editable packages; a clean recipient keeps config without secrets or folder grants', async () => {
  test.setTimeout(240_000);
  const info = test.info();
  const source = await launchApp({ ai: false });
  const gardenFile = info.outputPath('workspace.cruxspace');
  const runnerFile = info.outputPath('runner.crux');
  const gardenName = 'Team workspace';
  const titles = ['Team services', 'Team runner', 'Team source'];
  const secret = 'isolated-workspace-secret-never-in-a-package';
  const outsideMarker = 'linked-source-is-never-copied-into-the-package';
  const checkout = join(source.dir, 'outside-checkout');
  const compose = 'services:\n  web:\n    image: nginx:alpine\n    ports: ["127.0.0.1:8341:80"]\n';
  const runnerConfig =
    JSON.stringify(
      { version: 1, app: 'runner', setups: [], note: 'Saved handoff configuration' },
      null,
      2,
    ) + '\n';
  let sourceIds: string[] = [];
  let linkConfig = '';
  try {
    const { page, app } = source;
    mkdirSync(checkout);
    writeFileSync(
      join(checkout, 'package.json'),
      JSON.stringify({
        name: 'outside-checkout',
        scripts: { dev: 'node -e "process.exit(0)"' },
      }),
    );
    writeFileSync(join(checkout, 'private-source.txt'), outsideMarker);
    await enterGarden(page);
    await newGarden(page, gardenName);
    const stackId = await addTool(page, 'Stack', titles[0]!);
    await savedFile(page, stackId, 'compose.yaml', compose);
    // The real secure store is installation-local; its export exclusion must
    // hold even when the selected Stack owns a saved secret.
    await page.evaluate(
      async ({ id, secret }) => {
        await window.electronAPI!.secrets.set(
          `cruxgarden:fn-secrets:${id}`,
          JSON.stringify({ TOKEN: secret }),
        );
      },
      { id: stackId, secret },
    );
    expect(
      await page.evaluate(
        (id) => window.electronAPI!.secrets.get(`cruxgarden:fn-secrets:${id}`),
        stackId,
      ),
    ).toContain(secret);
    const runnerId = await addTool(page, 'Runner', titles[1]!);
    await savedFile(page, runnerId, 'workspace.json', runnerConfig);
    const linkId = await addTool(page, 'Link', titles[2]!);
    sourceIds = [stackId, runnerId, linkId];
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, checkout);
    const bench = page.frameLocator('iframe[data-crux-id]');
    await bench.getByRole('button', { name: 'Choose folder…', exact: true }).click();
    await expect(bench.locator('#folder')).toContainText('outside-checkout');
    await expect
      .poll(
        async () =>
          JSON.parse(
            await page.evaluate(async (id) => {
              const content = window.electronAPI!.sqlite.fileContent!;
              const head = await content.head(id);
              const { entries } = await content.list({ cruxId: id, expected: head! });
              const entry = entries.find((entry) => entry.path === 'link.json')!;
              const file = await content.read({ cruxId: id, expected: head!, path: entry.path });
              return new TextDecoder().decode(file!.bytes);
            }, linkId),
          ).folder,
      )
      .toBe(checkout);
    const linkFolder = (await storedCrux(page, linkId)).projectFolder as string;
    linkConfig = readFileSync(join(linkFolder, 'link.json'), 'utf8');
    expect(
      await page.evaluate((folder) => window.electronAPI!.projectRunner.read({ folder }), checkout),
    ).toMatchObject({ approved: true });

    await captureDownloads(app, { garden: gardenFile, crux: runnerFile });
    await goHome(page);
    await page.getByRole('button', { name: `Open ${titles[0]}`, exact: true }).click();
    const share = await openPanel(page, 'publish', 'Toggle share');
    await expect(
      share.getByRole('heading', { name: 'An editable Garden package', exact: true }),
    ).toBeVisible();
    const choice = share.getByLabel('Garden', { exact: true });
    await expect(choice).toHaveValue('');
    await expect(
      share.getByRole('button', { name: 'Export Garden package', exact: true }),
    ).toBeDisabled();
    await choice.selectOption({ label: gardenName });
    await expect(share.getByText('Includes 3 Cruxes', { exact: true })).toBeVisible();
    expect((await share.getByRole('listitem').allTextContents()).sort()).toEqual(
      [...titles].sort(),
    );
    await share.getByRole('button', { name: 'Export Garden package', exact: true }).click();
    let confirmation = page.getByRole('dialog', { name: `Export ${gardenName}`, exact: true });
    for (const title of titles) await expect(confirmation).toContainText(title);
    await expect(confirmation).toContainText('files, Collaboration, Tasks and Growth');
    await expect(confirmation).toContainText(
      'Saved secrets and local folder permissions are excluded',
    );
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    expect(await downloads(app)).toEqual([]);
    expect(existsSync(gardenFile)).toBe(false);
    await share.getByRole('button', { name: 'Export Garden package', exact: true }).click();
    confirmation = page.getByRole('dialog', { name: `Export ${gardenName}`, exact: true });
    await confirmation.getByRole('button', { name: 'Export Garden package', exact: true }).click();
    await expect
      .poll(async () => (await downloads(app)).filter((item) => item.state === 'completed').length)
      .toBe(1);
    const archive = await JSZip.loadAsync(readFileSync(gardenFile));
    const manifest = JSON.parse(await archive.file('cruxspace.json')!.async('text'));
    expect(manifest.space.name).toBe(gardenName);
    expect(manifest.members.map((member: { title: string }) => member.title).sort()).toEqual(
      [...titles].sort(),
    );
    expect(manifest.unavailable).toEqual([]);
    for (const entry of Object.values(archive.files)) {
      if (entry.dir) continue;
      const bytes = await entry.async('nodebuffer');
      expect(bytes.includes(Buffer.from(secret))).toBe(false);
      expect(bytes.includes(Buffer.from(outsideMarker))).toBe(false);
      expect(entry.name).not.toContain('approved-folders.json');
    }
    await page.screenshot({ path: info.outputPath('workspace-package-exported.png') });

    // Runner exposes the same handoff surface, and its single-Crux alternative
    // requires separate consent and excludes its neighbouring Stack and Link.
    await goHome(page);
    await page.getByRole('button', { name: `Open ${titles[1]}`, exact: true }).click();
    const runnerShare = await openPanel(page, 'publish', 'Toggle share');
    await expect(runnerShare.getByLabel('Garden', { exact: true })).toHaveValue('');
    await runnerShare.getByRole('button', { name: 'Export this Crux', exact: true }).click();
    const onlyThis = page.getByRole('dialog', { name: 'Export this Crux', exact: true });
    await expect(onlyThis).toContainText('Other Cruxes in its workspace are not included');
    await onlyThis.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(onlyThis).toHaveCount(0);
    expect(await downloads(app)).toHaveLength(1);
    expect(existsSync(runnerFile)).toBe(false);
    await runnerShare.getByRole('button', { name: 'Export this Crux', exact: true }).click();
    await onlyThis.getByRole('button', { name: 'Export Crux file', exact: true }).click();
    await expect
      .poll(async () => (await downloads(app)).filter((item) => item.state === 'completed').length)
      .toBe(2);
    const single = await JSZip.loadAsync(readFileSync(runnerFile));
    const graph = JSON.parse(await single.file('graph.json')!.async('text'));
    expect(graph.selection.roots).toEqual([runnerId]);
    expect(graph.cruxes.map((crux: { id: string }) => crux.id)).not.toContain(stackId);
    expect(graph.cruxes.map((crux: { id: string }) => crux.id)).not.toContain(linkId);
  } finally {
    await source.app.close();
  }

  let target = await launchApp({ ai: false });
  const targetDir = target.dir;
  let restoredGarden = '';
  let importedGarden = '';
  let imported: { id: string; title: string }[] = [];
  const verifyRecipient = async () => {
    const { page } = target;
    const restored = await page.evaluate(
      async (id) => (await window.electronAPI!.sqlite.gardenMembership!.list(id)).items,
      restoredGarden,
    );
    expect(restored.map((member) => member.id).sort()).toEqual([...sourceIds].sort());
    for (const member of restored) {
      const folder = (await storedCrux(page, member.id)).projectFolder as string;
      const [path, content] =
        member.title === titles[0]
          ? ['compose.yaml', compose]
          : member.title === titles[1]
            ? ['workspace.json', runnerConfig]
            : ['link.json', linkConfig];
      expect(readFileSync(join(folder, path!), 'utf8')).toBe(content);
    }
    const saved = await page.evaluate(
      async (id) => (await window.electronAPI!.sqlite.gardenMembership!.list(id)).items,
      importedGarden,
    );
    expect(saved.map((member) => member.title).sort()).toEqual([...titles].sort());
    for (const member of imported) {
      expect(sourceIds).not.toContain(member.id);
      const folder = (await storedCrux(page, member.id)).projectFolder as string;
      const [path, content] =
        member.title === titles[0]
          ? ['compose.yaml', compose]
          : member.title === titles[1]
            ? ['workspace.json', runnerConfig]
            : ['link.json', linkConfig];
      expect(readFileSync(join(folder, path!), 'utf8')).toBe(content);
      expect(
        await page.evaluate(
          (id) => window.electronAPI!.secrets.get(`cruxgarden:fn-secrets:${id}`),
          member.id,
        ),
      ).toBeNull();
    }
    for (const id of sourceIds)
      expect(
        await page.evaluate(
          (id) => window.electronAPI!.secrets.get(`cruxgarden:fn-secrets:${id}`),
          id,
        ),
      ).toBeNull();
    expect(
      await page.evaluate((folder) => window.electronAPI!.projectRunner.read({ folder }), checkout),
    ).toMatchObject({ approved: false });
    expect(existsSync(join(targetDir, 'userData', 'approved-folders.json'))).toBe(false);
  };
  try {
    await enterGarden(target.page);
    await target.page.getByLabel('Garden package', { exact: true }).setInputFiles(gardenFile);
    await expect(
      target.page.getByRole('button', { name: 'Garden location', exact: true }),
    ).toHaveText(gardenName);
    // A fresh installation restores logical identities. Importing the same
    // package again makes an independent copy when those identities exist.
    restoredGarden = new URL(target.page.url()).searchParams.get('garden')!;
    const restored = await target.page.evaluate(
      async (id) => (await window.electronAPI!.sqlite.gardenMembership!.list(id)).items,
      restoredGarden,
    );
    expect(restored.map((member) => member.id).sort()).toEqual([...sourceIds].sort());
    await goToGarden(target.page, 'My Garden');
    await target.page.getByLabel('Garden package', { exact: true }).setInputFiles(gardenFile);
    await expect(
      target.page.getByRole('button', { name: 'Garden location', exact: true }),
    ).toHaveText(gardenName);
    importedGarden = new URL(target.page.url()).searchParams.get('garden')!;
    expect(importedGarden).not.toBe(restoredGarden);
    imported = await target.page.evaluate(
      async (id) => (await window.electronAPI!.sqlite.gardenMembership!.list(id)).items,
      importedGarden,
    );
    expect(imported).toHaveLength(3);
    await verifyRecipient();
    for (const title of titles)
      await expect(
        target.page.getByRole('button', { name: `Open ${title}`, exact: true }),
      ).toBeVisible();
    await target.page.getByRole('button', { name: `Open ${titles[2]}`, exact: true }).click();
    const importedLink = target.page.frameLocator('iframe[data-crux-id]');
    await expect(importedLink.locator('#folder')).toContainText('outside-checkout');
    await importedLink.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(importedLink.locator('#status')).toContainText(
      'Choose this folder in Crux Garden before running it',
    );
    const linkId = imported.find((member) => member.title === titles[2])!.id;
    expect(
      await target.page.evaluate(
        (cruxId) => window.electronAPI!.projectRunner.state({ cruxId }),
        linkId,
      ),
    ).toMatchObject({ status: 'idle' });
    await target.page.screenshot({ path: info.outputPath('workspace-package-folder-refusal.png') });
    await target.app.close();
    target = await launchApp({ ai: false, dir: targetDir });
    await target.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(target.page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    await verifyRecipient();
  } finally {
    await target.app.close();
  }
});
