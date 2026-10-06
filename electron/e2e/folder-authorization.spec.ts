import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

test('only allocated Project Folders remain accessible across a Garden root change and restart', async () => {
  let instance = await launchApp();
  const { dir } = instance;
  try {
    await enterGarden(instance.page);
    const id = await createCrux(instance.page, 'Original project');
    const folder = (await storedCrux(instance.page, id)).projectFolder as string;
    const oldRoot = dirname(folder);
    const sibling = join(oldRoot, 'personal');
    mkdirSync(sibling);
    writeFileSync(join(sibling, 'private.txt'), 'untouched');
    const nextRoot = join(dir, 'next-garden');
    mkdirSync(nextRoot);
    await instance.app.evaluate(({ dialog }, nextRoot) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [nextRoot] });
    }, nextRoot);
    expect(await instance.page.evaluate(() => window.electronAPI!.desktop.chooseGardenRoot())).toBe(
      nextRoot,
    );
    const nextId = await createCrux(instance.page, 'New project');
    const nextFolder = (await storedCrux(instance.page, nextId)).projectFolder as string;
    // Native realpath resolves Windows 8.3 aliases (RUNNER~1) as well as symlinks.
    expect(realpathSync.native(dirname(nextFolder))).toBe(realpathSync.native(nextRoot));

    const check = async () => {
      const results = await instance.page.evaluate(
        async ({ id, folder, nextFolder, oldRoot, sibling, nextRoot }) => {
          const api = window.electronAPI!;
          const results: string[] = [];
          const refused = async (operation: () => Promise<unknown>) => {
            try {
              await operation();
              results.push('ACCEPTED');
            } catch (error) {
              results.push((error as Error).message);
            }
          };
          for (const path of [oldRoot, nextRoot, sibling]) {
            await refused(() =>
              api.project.writeFile(path, 'private.txt', new TextEncoder().encode('wrong')),
            );
            await refused(() => api.project.readFile(path, 'private.txt'));
            await refused(() => api.project.ensureFolder(path));
            await refused(() => api.project.watch(path));
            await refused(() => api.preview.start(path));
            await refused(() => api.sqlite.updateCrux!(id, { meta: { projectFolder: path } }));
            await refused(() => api.sqlite.mergeCruxMeta!(id, { projectFolder: path }));
          }
          for (const path of [folder, nextFolder]) {
            await api.project.writeFile(path, 'allowed.txt', new TextEncoder().encode('kept'));
            const bytes = await api.project.readFile(path, 'allowed.txt');
            if (new TextDecoder().decode(bytes) !== 'kept') throw new Error('Owned write failed');
          }
          return results;
        },
        { id, folder, nextFolder, oldRoot, sibling, nextRoot },
      );
      expect(results).toHaveLength(21);
      expect(results.every((result) => /registered Project Folder/.test(result))).toBe(true);
      expect(readFileSync(join(sibling, 'private.txt'), 'utf8')).toBe('untouched');
      expect((await storedCrux(instance.page, id)).projectFolder).toBe(folder);
    };
    await check();
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Add Crux', exact: true }),
    ).toBeVisible();
    await check();
  } finally {
    await instance.app.close();
  }
});
