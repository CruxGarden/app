import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { enterGarden, storedCrux, reenterWorkspace } from './multi-crux-helpers';
import { startMockApi } from './api-mock';
import { showPane, openPanel, chooseSettingsSection, newTaskButton } from './panel-helpers';

/** An unfamiliar author's package: its public edition runs without the parent bridge. */
async function postcardPackage(filename: string) {
  const manifest = {
    version: 1,
    releaseVersion: '1.0.0',
    id: 'community-public-postcard',
    name: 'Public Postcard',
    description: 'Edit a postcard and share its declared visitor edition.',
    kind: 'webapp',
    defaultTitle: 'My public postcard',
    icon: 'pencil',
    desktopOnly: true,
    order: 1000,
    bundled: false,
    app: 'community-public-postcard',
    entryFile: 'index.html',
    contentRoot: 'data/',
    layout: 'workshop',
    document: {
      path: 'data/project.json',
      seed: { version: 1, app: 'community-public-postcard', text: '', image: '' },
    },
    share: true,
    publication: {
      type: 'static',
      root: 'public/',
      include: ['data/project.json', 'data/assets/'],
    },
    toolInfo: {
      name: 'Public Postcard',
      upstream: 'https://crux.garden',
      relationship: 'Test fixture based on the MIT-licensed Pocket Notes starter.',
      detailsPath: 'UPSTREAM.md',
    },
    routes: [],
    greeting: 'PRIVATE_COLLABORATION_POSTCARD: working notes stay in this Crux.',
    context: 'Use the existing document and asset bridge to edit this postcard.',
  };
  const editor = readFileSync(
    join(__dirname, '../../src/templates/tool-starter/index.html'),
    'utf8',
  )
    .replaceAll('Pocket Notes', 'Public Postcard')
    .replace(
      '<button id="save"',
      '<label for="image">Postcard image</label><input id="image" type="file" accept="image/png" /><button id="save"',
    )
    .replace(
      '    flushWith(save);',
      `
    document.querySelector('#image').onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const asset = await request({ op: 'native-import', bytes: await file.arrayBuffer(), mimeType: file.type });
        documentState.image = 'data/' + asset.path;
        revision++;
        dirty(true);
        await save();
      } catch (error) { status.textContent = error.message; }
    };
    flushWith(save);`,
    );
  const files = [
    { path: 'index.html', mimeType: 'text/html', bytes: Buffer.from(editor) },
    {
      path: 'garden/client.js',
      mimeType: 'text/javascript',
      bytes: readFileSync(join(__dirname, '../../src/templates/tool-starter/client.js')),
    },
    {
      path: 'crux-tool.json',
      mimeType: 'application/json',
      bytes: Buffer.from(JSON.stringify(manifest)),
    },
    {
      path: 'data/project.json',
      mimeType: 'application/json',
      bytes: Buffer.from(JSON.stringify(manifest.document.seed)),
    },
    {
      path: 'private/draft.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('PRIVATE_EDITOR_DRAFT_POSTCARD'),
    },
    {
      path: 'LICENSE',
      mimeType: 'text/plain',
      bytes: readFileSync(join(__dirname, '../../LICENSE')),
    },
    {
      path: 'UPSTREAM.md',
      mimeType: 'text/markdown',
      bytes: Buffer.from(manifest.toolInfo.relationship),
    },
    {
      path: 'public/index.html',
      mimeType: 'text/html',
      bytes: Buffer.from(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Public Postcard</title></head><body><h1>Postcard</h1><p id="note"></p><img id="picture" alt="Recipient artwork"><script src="visitor.js" defer></script></body></html>',
      ),
    },
    {
      path: 'public/visitor.js',
      mimeType: 'text/javascript',
      bytes: Buffer.from(
        "fetch('data/project.json').then(response => { if (!response.ok) throw new Error('Missing public document'); return response.json(); }).then(document => { window.document.querySelector('#note').textContent = document.text; window.document.querySelector('#picture').src = document.image; });",
      ),
    },
  ];
  const zip = new JSZip();
  zip.file(
    'tool-package.json',
    JSON.stringify({
      format: 'crux-tool',
      version: 1,
      tool: manifest,
      files: files.map(({ path, mimeType, bytes }) => ({ path, mimeType, size: bytes.length })),
    }),
  );
  for (const file of files) zip.file(`files/${file.path}`, file.bytes, { createFolders: false });
  writeFileSync(filename, await zip.generateAsync({ type: 'nodebuffer' }));
}

async function add(page: Page, template: string) {
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  await page
    .getByLabel('Find a starting point')
    .fill(template === 'tool-starter' ? 'Make a tool' : 'Pocket Notes');
  await page.locator(`[data-template-id="${template}"]`).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('iframe[data-crux-id]')).toBeVisible();
}

test('a creator exports an unknown .cruxtool and a clean recipient installs, edits and restarts', async () => {
  const testInfo = test.info();
  test.setTimeout(180_000);
  const api = await startMockApi();
  const publisher = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  const toolFile = testInfo.outputPath('pocket-notes.cruxtool');
  try {
    await enterGarden(publisher.page);
    await add(publisher.page, 'tool-starter');
    const frame = publisher.page.frameLocator('iframe[data-crux-id]');
    await frame.getByLabel('Your note').fill('Author-only test note');
    await frame.getByRole('button', { name: 'Save note' }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    await openPanel(publisher.page, 'details', 'Toggle details');
    const badge = publisher.page.getByRole('button', {
      name: /^(auto|Web App|Page|Document|Image|Tool template)$/i,
    });
    for (let i = 0; i < 8 && !/Tool template/i.test(await badge.innerText()); i++)
      await badge.click();
    await expect(badge).toHaveText('Tool template');
    await openPanel(publisher.page, 'export', 'Toggle export');
    await publisher.app.evaluate(({ session }, path) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
    }, toolFile);
    await publisher.page
      .getByRole('button', { name: 'Export Tool (.cruxtool)', exact: true })
      .click();
    await expect.poll(() => existsSync(toolFile)).toBe(true);
    const owner = (await publisher.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    const project = (await storedCrux(publisher.page, owner)).projectFolder;
    let advanced = false;
    await publisher.page.route(`${api.url}/cruxes/${owner}`, async (route) => {
      if (route.request().method() === 'GET' && !advanced) {
        advanced = true;
        const head = await publisher.page.evaluate(
          async (id) => window.electronAPI!.sqlite.fileContent!.head(id),
          owner,
        );
        // An internal file changes while the remote lookup is in flight. The
        // publication must already own the bytes it decided to share.
        writeFileSync(join(project, '.keep'), 'background change');
        await expect
          .poll(async () =>
            publisher.page.evaluate(
              async (id) => (await window.electronAPI!.sqlite.fileContent!.head(id))?.revision,
              owner,
            ),
          )
          .not.toBe(head?.revision);
      }
      await route.continue();
    });
    await openPanel(publisher.page, 'publish', 'Toggle share');
    await publisher.page.getByRole('button', { name: 'Share', exact: true }).click();
    await publisher.page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await publisher.page.getByRole('button', { name: 'Send Code' }).click();
    await publisher.page.getByPlaceholder('Enter code').fill('123456');
    await publisher.page.getByRole('button', { name: 'Connect', exact: true }).click();
    const backup = publisher.page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' });
    await expect(backup).toBeVisible();
    await backup.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(publisher.page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
    expect(advanced).toBe(true);
    await publisher.page.getByRole('switch', { name: 'Discoverable' }).click();
    await expect
      .poll(() =>
        Object.values(api.state.cruxes).some(
          (crux) => crux.kind === 'tool' && crux.discoverable === true,
        ),
      )
      .toBe(true);
  } finally {
    await publisher.app.close();
  }

  const recipient = await launchApp({ ai: false });
  try {
    await enterGarden(recipient.page);
    await recipient.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const dialog = recipient.page.getByRole('dialog', { name: 'Add Crux', exact: true });
    await dialog.locator('input[type=file][accept*=".cruxtool"]').setInputFiles(toolFile);
    await expect(recipient.page.getByRole('alertdialog', { name: 'Tool installed' })).toBeVisible();
    await recipient.page.getByRole('button', { name: 'OK', exact: true }).click();
    await recipient.page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = recipient.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Your note')).toHaveValue('');
    await frame.getByLabel('Your note').fill('Made by the recipient');
    await frame.getByRole('button', { name: 'Save note' }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    const id = (await recipient.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(recipient.page, id)).projectFolder;
    expect(JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).text).toBe(
      'Made by the recipient',
    );
    await recipient.page.screenshot({ path: testInfo.outputPath('installed-tool.png') });
  } finally {
    await recipient.app.close();
  }
  const restarted = await launchApp({ ai: false, dir: recipient.dir });
  try {
    await reenterWorkspace(restarted.page);
    await expect(
      restarted.page.frameLocator('iframe[data-crux-id]').getByLabel('Your note'),
    ).toHaveValue('Made by the recipient');
  } finally {
    await restarted.app.close();
  }
  const online = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(online.page);
    await showPane(online.page, 'Explore');
    await online.page
      .getByRole('region', { name: 'Explore', exact: true })
      .getByRole('tab', { name: 'Tools', exact: true })
      .click();
    const card = online.page.getByTestId('explore-tool-pocket-notes');
    await expect(card).toBeVisible();
    api.state.publishedDownloadDelayMs = 30_000;
    await card.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(card.getByRole('progressbar')).toBeVisible();
    await expect
      .poll(async () => Number(await card.getByRole('progressbar').getAttribute('value')))
      .toBeGreaterThan(0);
    await card.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card).toContainText('Cancelled. You can retry');
    await expect(card.getByTestId('tool-installed')).toHaveCount(0);
    api.state.publishedDownloadDelayMs = undefined;
    await card.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(card.getByTestId('tool-installed')).toBeVisible();
    const homeUrl = online.page.url();
    const settings = await showPane(online.page, 'Settings');
    await chooseSettingsSection(online.page, 'Tools and Moods');
    await settings
      .getByTestId('installed-tools')
      .getByRole('button', { name: 'Source and updates', exact: true })
      .click();
    await expect(
      online.page.getByRole('region', { name: 'Install this tool', exact: true }),
    ).toBeVisible();
    await expect(online.page.getByTestId('tool-installed')).toBeVisible();
    await online.page.goto(homeUrl);
    await online.page.keyboard.press('Escape');
    await online.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await online.page.locator('[data-template-id^="installed-"]').click();
    await online.page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(
      online.page.frameLocator('iframe[data-crux-id]').getByLabel('Your note'),
    ).toHaveValue('');
  } finally {
    await online.app.close();
    await api.close();
  }
});

test('an unfamiliar installed tool shares its declared static edition with the recipient’s saved document and asset', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const info = test.info();
  const toolFile = info.outputPath('public-postcard.cruxtool');
  await postcardPackage(toolFile);
  const imageFile = info.outputPath('recipient-artwork.png');
  const imageBytes = readFileSync(join(__dirname, '../../tool-cruxes/openmosh/assets/demo.png'));
  writeFileSync(imageFile, imageBytes);
  const imagePath = `data/assets/${createHash('sha256').update(imageBytes).digest('hex')}.bin`;
  const api = await startMockApi();
  const recipient = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = recipient;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Add Crux', exact: true });
    await picker.getByLabel('Find a starting point').fill('Public Postcard');
    await expect(picker.getByRole('button', { name: /^Public Postcard/ })).toHaveCount(0);
    await picker.locator('input[type=file][accept*=".cruxtool"]').setInputFiles(toolFile);
    await expect(page.getByRole('alertdialog', { name: 'Tool installed' })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Your note')).toHaveValue('');
    await frame.getByLabel('Your note').fill('Made by the recipient — public postcard');
    await frame.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    await frame.getByLabel('Postcard image').setInputFiles(imageFile);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const meta = await storedCrux(page, id);
    const folder = meta.projectFolder as string;
    await expect
      .poll(() => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).image)
      .toBe(imagePath);
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    expect(readFileSync(join(folder, imagePath))).toEqual(imageBytes);
    expect(meta.toolManifest.publication).toEqual({
      type: 'static',
      root: 'public/',
      include: ['data/project.json', 'data/assets/'],
    });
    expect(JSON.stringify(meta.messages)).toContain('PRIVATE_COLLABORATION_POSTCARD');

    const share = await openPanel(page, 'publish', 'Toggle share');
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code', exact: true }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const warning = page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' });
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: 'Share without a backup', exact: true }).click();
    await expect(share.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 45_000 });
    const published = api.state.published[id]!;
    expect(published.map((file) => file.path).sort()).toEqual(
      ['index.html', 'visitor.js', 'data/project.json', imagePath].sort(),
    );
    expect(published.find((file) => file.path === imagePath)!.bytes).toEqual(imageBytes);
    expect(
      JSON.parse(published.find((file) => file.path === 'data/project.json')!.bytes.toString()),
    ).toMatchObject({
      text: 'Made by the recipient — public postcard',
      image: imagePath,
    });
    expect(api.state.cruxes[id]).toMatchObject({ data: '', meta: { messages: [] } });
    const uploaded = published.map((file) => file.bytes.toString()).join('\n');
    expect(uploaded).not.toContain('PRIVATE_EDITOR_DRAFT_POSTCARD');
    expect(uploaded).not.toContain('PRIVATE_COLLABORATION_POSTCARD');
    expect(uploaded).not.toContain('Open this editor inside Crux Garden.');
    await page.screenshot({ path: info.outputPath('community-static-shared.png') });

    const visitor = await browser.newPage();
    const errors: string[] = [];
    visitor.on('pageerror', (error) => errors.push(error.message));
    try {
      expect((await visitor.goto(`${api.url}/published/${id}/index.html`))?.status()).toBe(200);
      await expect(visitor.locator('#note')).toHaveText('Made by the recipient — public postcard');
      await expect(visitor.getByRole('img', { name: 'Recipient artwork' })).toBeVisible();
      await expect
        .poll(() =>
          visitor.locator('#picture').evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      expect(await visitor.evaluate(() => window.parent === window)).toBe(true);
      expect(errors).toEqual([]);
      await visitor.screenshot({ path: info.outputPath('community-static-visitor.png') });
    } finally {
      await visitor.close();
    }
  } finally {
    await recipient.app.close();
    await api.close();
  }
});

test('an unfamiliar tool Task keeps its editor after uninstall and restart while Share stays in Main', async () => {
  test.setTimeout(150_000);
  const info = test.info();
  const toolFile = info.outputPath('task-postcard.cruxtool');
  await postcardPackage(toolFile);
  const api = await startMockApi();
  const first = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  let taskId: string;
  let taskFolder: string;
  let mainId: string;
  let mainFolder: string;
  let toolSnapshot: unknown;
  try {
    const { page } = first;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Add Crux', exact: true })
      .locator('input[type=file][accept*=".cruxtool"]')
      .setInputFiles(toolFile);
    await expect(page.getByRole('alertdialog', { name: 'Tool installed' })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Add Crux', exact: true })
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill('My public postcard');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Your note')).toHaveValue('');
    await frame.getByLabel('Your note').fill('Retained Main postcard');
    await frame.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    mainId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const main = await storedCrux(page, mainId);
    mainFolder = main.projectFolder;
    toolSnapshot = main.toolManifest;
    await (await newTaskButton(page)).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Postcard variation');
    await page.getByRole('button', { name: 'Save and start task', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    taskId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    expect(taskId).not.toBe(mainId);
    const task = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get(
          'SELECT meta, project_folder FROM working_copies WHERE id = ?',
          [id],
        ),
      taskId,
    )) as { meta: string; project_folder: string };
    taskFolder = task.project_folder;
    expect(JSON.parse(task.meta).toolManifest).toEqual(toolSnapshot);
    await openPanel(page, 'workshop', 'Toggle workshop');
    await expect(frame.getByLabel('Your note')).toHaveValue('Retained Main postcard');
    await frame.getByLabel('Your note').fill('Task draft before removal');
    await frame.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');

    // Return focus from the guest document before using the host shortcut.
    await page
      .getByTestId('task-details')
      .getByRole('heading', { name: 'This task', exact: true })
      .click();
    const settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Tools and Moods');
    const installed = settings.getByTestId(`installed-tool-${main.template}`);
    await installed.getByRole('button', { name: 'Remove', exact: true }).click();
    const remove = page.getByRole('dialog', { name: 'Remove Public Postcard?', exact: true });
    await expect(remove).toContainText('Cruxes you made from it keep working');
    await remove.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(installed).toHaveCount(0);
    await expect(settings.getByTestId('installed-tools')).toContainText('None yet');
  } catch (error) {
    await api.close();
    throw error;
  } finally {
    await first.app.close();
  }
  const restarted = await launchApp({ ai: false, dir: first.dir, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = restarted;
    await reenterWorkspace(page, 'My public postcard · Postcard variation');
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    await openPanel(page, 'workshop', 'Toggle workshop');
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Your note')).toHaveValue('Task draft before removal');
    await frame.getByLabel('Your note').fill('Task saved after uninstall and restart');
    await frame.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    expect(JSON.parse(readFileSync(join(taskFolder, 'data/project.json'), 'utf8')).text).toBe(
      'Task saved after uninstall and restart',
    );
    expect(JSON.parse(readFileSync(join(mainFolder, 'data/project.json'), 'utf8')).text).toBe(
      'Retained Main postcard',
    );
    expect(readFileSync(join(taskFolder, 'private/draft.txt'), 'utf8')).toBe(
      'PRIVATE_EDITOR_DRAFT_POSTCARD',
    );
    const retained = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get('SELECT meta FROM working_copies WHERE id = ?', [id]),
      taskId,
    )) as { meta: string };
    expect(JSON.parse(retained.meta).toolManifest).toEqual(toolSnapshot);
    const share = await openPanel(page, 'publish', 'Toggle share');
    await expect(share.getByText('Available in Main', { exact: true })).toBeVisible();
    await expect(share.getByRole('button', { name: /^Share/ })).toHaveCount(0);
    expect(Object.keys(api.state.published)).toEqual([]);
    await page.screenshot({ path: info.outputPath('community-task-after-uninstall.png') });
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', mainId);
    await openPanel(page, 'workshop', 'Toggle workshop');
    await expect(frame.getByLabel('Your note')).toHaveValue('Retained Main postcard');
  } finally {
    await restarted.app.close();
    await api.close();
  }
});
