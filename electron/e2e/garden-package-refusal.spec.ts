import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from './launch';
import {
  createCrux,
  enterGarden,
  goHome,
  storedCrux,
  storedFingerprint,
} from './multi-crux-helpers';
import { newGarden, writeFirstFile } from './journeys/journey-helpers';

const openCard = (page: Page, title: string) =>
  page.getByRole('main').getByRole('button', { name: `Open ${title}`, exact: true });

async function rootGarden(page: Page) {
  await goHome(page);
  await page.getByRole('button', { name: 'Garden location', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Garden ancestry' })
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
}

async function members(page: Page, id: string) {
  return page.evaluate(
    async (id) => (await window.electronAPI!.sqlite.gardenMembership!.list(id)).items,
    id,
  );
}

async function removeCard(page: Page, title: string) {
  const card = openCard(page, title).locator('..');
  await card.hover();
  await card.getByRole('button', { name: 'Crux actions', exact: true }).click();
  await card.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(openCard(page, title)).toHaveCount(0);
}

/** Refuse real native writes, leaving the first admitted member for cleanup. */
async function refuseSecondMemberAndCleanup(app: ElectronApplication, title: string) {
  await app.evaluate(({ app }, title) => {
    const path = process.getBuiltinModule('path');
    const load = process
      .getBuiltinModule('module')
      .createRequire(path.join(app.getAppPath(), 'package.json'));
    const { LocalGraphRuntime } = load(
      '@cruxgarden/local-api',
    ) as typeof import('@cruxgarden/local-api');
    const original = LocalGraphRuntime.prototype.importPrivateGraph;
    LocalGraphRuntime.prototype.importPrivateGraph = async function (...args) {
      LocalGraphRuntime.prototype.importPrivateGraph = original;
      await this.run(
        `CREATE TRIGGER refuse_package_member BEFORE INSERT ON cruxes WHEN NEW.title = '${title.replaceAll("'", "''")}' BEGIN SELECT RAISE(ABORT, 'Second member storage refused'); END`,
      );
      // Deleting the Garden itself remains possible: the service must keep it
      // while a member is retained, rather than hiding the partial import.
      await this.run(
        "CREATE TRIGGER refuse_package_cleanup BEFORE DELETE ON cruxes WHEN OLD.kind IS NOT 'garden' BEGIN SELECT RAISE(ABORT, 'Member cleanup refused'); END",
      );
      (
        globalThis as typeof globalThis & { clearPackageFault?: () => Promise<void> }
      ).clearPackageFault = async () => {
        await this.run('DROP TRIGGER refuse_package_member');
        await this.run('DROP TRIGGER refuse_package_cleanup');
      };
      return original.apply(this, args);
    };
  }, title);
}

test('selected-Garden import reports and exposes a retained partial copy through restart, removal and fresh retry', async () => {
  const info = test.info();
  test.setTimeout(210_000);
  let instance = await launchApp({ ai: false });
  const dir = instance.dir;
  const archive = join(dir, 'selected-garden.cruxspace');
  try {
    let { page, app } = instance;
    await enterGarden(page);
    await newGarden(page, 'Original collection');
    const originalGarden = new URL(page.url()).searchParams.get('garden')!;
    const originals = [];
    for (const title of ['First work', 'Second work']) {
      const id = await createCrux(page, title);
      await writeFirstFile(page, 'hello.txt', title);
      await expect
        .poll(() => storedFingerprint(page, id, 'hello.txt'))
        .toBe(createHash('sha256').update(title).digest('hex'));
      originals.push({
        id,
        title,
        folder: (await storedCrux(page, id)).projectFolder as string,
        head: await page.evaluate((id) => window.electronAPI!.sqlite.fileContent!.head(id), id),
      });
    }
    await goHome(page);
    await app.evaluate(({ session }, filename) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(filename));
    }, archive);
    await page.getByRole('button', { name: 'Export Garden', exact: true }).click();
    await expect.poll(() => existsSync(archive)).toBe(true);
    const zip = await JSZip.loadAsync(readFileSync(archive));
    const manifest = JSON.parse(await zip.file('cruxspace.json')!.async('text')) as {
      members: { id: string; title: string }[];
    };
    expect(manifest.members).toHaveLength(2);
    const retainedTitle = manifest.members[0]!.title;
    const refusedTitle = manifest.members[1]!.title;
    await rootGarden(page);
    await newGarden(page, 'Import destination');
    const destination = new URL(page.url()).searchParams.get('garden')!;
    await refuseSecondMemberAndCleanup(app, refusedTitle);
    await page.getByLabel('Garden package', { exact: true }).setInputFiles(archive);
    const error = page.getByRole('region', { name: 'Garden actions' }).getByRole('alert');
    await expect(error).toContainText(
      'Importing Garden "Original collection" failed and cleanup could not finish.',
    );
    await expect(error).toContainText(`Imported Cruxes retained: "${retainedTitle}"`);
    await expect(error).toContainText(
      'Review and remove the partial Garden "Original collection" before importing again.',
    );
    await expect(openCard(page, 'Original collection')).toBeVisible();
    await page.screenshot({ path: info.outputPath('partial-garden-import-refusal.png') });
    const partials = await members(page, destination);
    expect(partials).toHaveLength(1);
    const partialId = partials[0]!.id;
    expect(partialId).not.toBe(originalGarden);
    const partialMembers = await members(page, partialId);
    expect(partialMembers).toHaveLength(1);
    expect(partialMembers[0]!.title).toBe(retainedTitle);
    const partialFolder = (await storedCrux(page, partialMembers[0]!.id)).projectFolder as string;
    expect(readFileSync(join(partialFolder, 'hello.txt'), 'utf8')).toBe(retainedTitle);
    await openCard(page, 'Original collection').click();
    await expect(openCard(page, retainedTitle)).toBeVisible();
    await expect(openCard(page, refusedTitle)).toHaveCount(0);
    await app.evaluate(async () => {
      const state = globalThis as typeof globalThis & { clearPackageFault?: () => Promise<void> };
      await state.clearPackageFault!();
      delete state.clearPackageFault;
    });
    await app.close();
    instance = await launchApp({ ai: false, dir });
    ({ page, app } = instance);
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    await rootGarden(page);
    await openCard(page, 'Import destination').click();
    await expect(openCard(page, 'Original collection')).toBeVisible();
    expect((await members(page, destination)).map((member) => member.id)).toEqual([partialId]);
    expect((await members(page, partialId)).map((member) => member.id)).toEqual([
      partialMembers[0]!.id,
    ]);
    for (const original of originals) {
      expect(
        await page.evaluate((id) => window.electronAPI!.sqlite.fileContent!.head(id), original.id),
      ).toEqual(original.head);
      expect(readFileSync(join(original.folder, 'hello.txt'), 'utf8')).toBe(original.title);
    }
    expect((await members(page, originalGarden)).map((member) => member.id).sort()).toEqual(
      originals.map((original) => original.id).sort(),
    );
    // Review and remove precisely the retained copy through the normal UI.
    // The partial member's disk bytes remain available even after Trash.
    await openCard(page, 'Original collection').click();
    await removeCard(page, retainedTitle);
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Garden ancestry' })
      .getByRole('button', { name: 'Import destination', exact: true })
      .click();
    await removeCard(page, 'Original collection');
    expect(readFileSync(join(partialFolder, 'hello.txt'), 'utf8')).toBe(retainedTitle);
    await page.getByLabel('Garden package', { exact: true }).setInputFiles(archive);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Original collection',
    );
    await expect(openCard(page, 'First work')).toBeVisible();
    await expect(openCard(page, 'Second work')).toBeVisible();
    const successfulId = new URL(page.url()).searchParams.get('garden')!;
    expect(successfulId).not.toBe(partialId);
    expect((await members(page, destination)).map((member) => member.id)).toEqual([successfulId]);
    for (const member of await members(page, successfulId)) {
      const folder = (await storedCrux(page, member.id)).projectFolder as string;
      expect(readFileSync(join(folder, 'hello.txt'), 'utf8')).toBe(member.title);
    }
    for (const original of originals) {
      expect(
        await page.evaluate((id) => window.electronAPI!.sqlite.fileContent!.head(id), original.id),
      ).toEqual(original.head);
      expect(readFileSync(join(original.folder, 'hello.txt'), 'utf8')).toBe(original.title);
    }
  } finally {
    await instance.app.close();
  }
});
