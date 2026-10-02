import { beforeEach, expect, it } from 'vitest';
import JSZip from 'jszip';
import { localApiFixture } from '@/test/local-api-fixture';
import { useGardenContext } from '@/stores/gardenContext';
import { initServices, getServices } from './index';
import { createCruxspace } from './cruxspaces';
import { exportCruxspace, importCruxspace, peekCruxspace } from './cruxspace-package';

const native = localApiFixture();
beforeEach(() => initServices());

async function packageOfWork() {
  const { crux, artifact } = getServices();
  const first = await crux.create({ title: 'First' });
  const second = await crux.create({ title: 'Second' });
  for (const member of [first, second])
    await artifact.create({
      resourceId: member.id,
      content: member.title ?? 'Untitled',
      meta: { path: 'hello.txt' },
    });
  const space = await createCruxspace({ name: 'Work', brief: '', cruxIds: [first.id, second.id] });
  return { space, ...(await exportCruxspace({ spaceId: space.id })) };
}

async function identities() {
  // Include soft-deleted rows: failed intake must not leave invisible identities
  // that prevent a later restore or clutter retained storage.
  return native().client.all('SELECT id, deleted FROM cruxes ORDER BY id');
}

it('reports native member and Garden conflicts without creating anything', async () => {
  const { blob, manifest, space } = await packageOfWork();
  const before = await identities();
  expect((await peekCruxspace(blob)).conflicts.sort()).toEqual(
    [...manifest.members.map((member) => member.id), space.id].sort(),
  );
  expect(await identities()).toEqual(before);
});

for (const operation of ['inspect', 'import'] as const)
  it(`propagates native database refusal during package ${operation} and permits retry`, async () => {
    const { blob, space } = await packageOfWork();
    const before = await identities();
    await native().faultSql('ALTER TABLE cruxes RENAME TO unavailable_cruxes');
    try {
      const action =
        operation === 'inspect' ? peekCruxspace(blob) : importCruxspace({ data: blob });
      await expect(action).rejects.toThrow(/no such table/i);
    } finally {
      await native().faultSql('ALTER TABLE unavailable_cruxes RENAME TO cruxes');
    }
    expect(await identities()).toEqual(before);
    expect((await peekCruxspace(blob)).conflicts).toContain(space.id);
  });

it('validates all incoming member bytes before admitting any part, even when cached locally', async () => {
  const { blob, manifest } = await packageOfWork();
  const before = await identities();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const member = manifest.members[1]!;
  const fingerprints = JSON.parse(await zip.file(`${member.archive}blobs.json`)!.async('text'));
  const content = `blobs/${fingerprints[0]}`;
  expect(content).toBeTruthy();
  zip.remove(content);
  const broken = await zip.generateAsync({ type: 'blob' });
  native().failNextImportHost('Folder preparation sentinel');
  await expect(importCruxspace({ data: broken, mode: 'clone' })).rejects.toThrow(
    /missing|file|content/i,
  );
  // Invalid bytes refuse before a host folder is requested; the one-shot
  // host refusal remains for the next valid intake.
  await expect(importCruxspace({ data: blob, mode: 'clone' })).rejects.toThrow(
    'Folder preparation sentinel',
  );
  expect(await identities()).toEqual(before);
  expect((await peekCruxspace(blob)).conflicts).toHaveLength(3);
});

it('refuses a member whose declared identity differs from its actual native archive root', async () => {
  const { blob } = await packageOfWork();
  const before = await identities();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('cruxspace.json')!.async('text'));
  const member = manifest.members[1];
  const prefix = member.archive;
  member.id = crypto.randomUUID();
  member.archive = `members/${member.id}/`;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith(prefix)) continue;
    zip.file(
      `${member.archive}${entry.name.slice(prefix.length)}`,
      await entry.async('uint8array'),
    );
  }
  zip.remove(prefix);
  zip.file('cruxspace.json', JSON.stringify(manifest));
  await expect(
    importCruxspace({ data: await zip.generateAsync({ type: 'blob' }), mode: 'clone' }),
  ).rejects.toThrow(/identity|root/i);
  expect(await identities()).toEqual(before);
});

it('includes a trashed Garden root in conflicts and imports an independent copy', async () => {
  const { blob, space } = await packageOfWork();
  await getServices().crux.trash(space.id);
  expect((await peekCruxspace(blob)).conflicts).toContain(space.id);
  const copy = await importCruxspace({ data: blob });
  expect(copy.space.id).not.toBe(space.id);
  expect(copy.space.origin?.spaceId).toBe(space.id);
  expect((await getServices().crux.findById(space.id)).deleted).toBeTruthy();
});

it('refuses every package entry point when the native archive port is unavailable', async () => {
  const { blob, space } = await packageOfWork();
  const before = await identities();
  const client = native().client;
  const owner = client.privateArchive;
  client.privateArchive = undefined;
  try {
    await expect(peekCruxspace(blob)).rejects.toThrow(/API archive service is unavailable/);
    await expect(exportCruxspace({ spaceId: space.id })).rejects.toThrow(
      /API archive service is unavailable/,
    );
    await expect(importCruxspace({ data: blob })).rejects.toThrow(
      /API archive service is unavailable/,
    );
  } finally {
    client.privateArchive = owner;
  }
  expect(await identities()).toEqual(before);
});

it('keeps the selected destination and chooser values captured before asynchronous intake', async () => {
  const { blob } = await packageOfWork();
  const original = useGardenContext.getState().garden!.id;
  const other = await getServices().crux.create({ title: 'Other Garden', kind: 'garden' });
  const options = { data: blob, mode: 'clone' as const, name: 'Captured name' };
  const intake = importCruxspace(options);
  useGardenContext.getState().select(other);
  options.name = 'Changed later';
  const imported = await intake;
  expect(imported.space.name).toBe('Captured name');
  expect(
    (await native().client.gardenMembership!.parents(imported.space.id)).map((p) => p.id),
  ).toEqual([original]);
});
