import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localApiFixture } from '@/test/local-api-fixture';
import { useGardenContext } from '@/stores/gardenContext';
import { initServices, getServices } from './index';
import { createCruxspace, getCruxspace, listCruxspaces } from './cruxspaces';
import { exportCruxspace, importCruxspace, peekCruxspace } from './cruxspace-package';

const native = localApiFixture();
beforeEach(() => initServices());

async function packageOfWork() {
  const { crux, artifact } = getServices();
  const first = await crux.create({ title: 'First', type: 'workspace' });
  const second = await crux.create({ title: 'Second', type: 'workspace' });
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

it('exports only the reviewed Garden members and captures the caller’s selection before asynchronous reads', async () => {
  const { manifest, space } = await packageOfWork();
  const expectedMemberIds = manifest.members.map((member) => member.id);
  const options = { spaceId: space.id, expectedMemberIds };
  const pending = exportCruxspace(options);
  options.spaceId = crypto.randomUUID();
  expectedMemberIds.length = 0;
  expect((await pending).manifest.members.map((member) => member.id).sort()).toEqual(
    manifest.members.map((member) => member.id).sort(),
  );

  const additional = await getServices().crux.create({ title: 'Later member', type: 'workspace' });
  await native().client.gardenMembership!.add({ gardenId: space.id, memberId: additional.id });
  await expect(
    exportCruxspace({
      spaceId: space.id,
      expectedMemberIds: manifest.members.map((member) => member.id),
    }),
  ).rejects.toThrow('This Garden’s members changed. Review the list before exporting.');
  const reviewed = (await getCruxspace(space.id)).cruxIds;
  expect(
    (await exportCruxspace({ spaceId: space.id, expectedMemberIds: reviewed })).manifest.members
      .map((member) => member.id)
      .sort(),
  ).toEqual([...reviewed].sort());
});

it('refuses a reviewed member disappearing between membership and live reads before exporting any archive', async () => {
  const { manifest, space } = await packageOfWork();
  const expectedMemberIds = manifest.members.map((member) => member.id);
  const removedId = expectedMemberIds[1]!;
  const { crux } = getServices();
  const listAll = crux.listAll.bind(crux);
  const list = vi.spyOn(crux, 'listAll').mockImplementationOnce(async () => {
    await crux.trash(removedId);
    return listAll();
  });
  const exporting = vi.spyOn(native().client.privateArchive!, 'export');
  const before = await Promise.all(
    expectedMemberIds.map((id) => native().client.fileContent!.head(id)),
  );
  try {
    await expect(exportCruxspace({ spaceId: space.id, expectedMemberIds })).rejects.toThrow(
      'This Garden’s members changed. Review the list before exporting.',
    );
    expect(exporting).not.toHaveBeenCalled();
    expect(
      await Promise.all(expectedMemberIds.map((id) => native().client.fileContent!.head(id))),
    ).toEqual(before);
  } finally {
    list.mockRestore();
    exporting.mockRestore();
  }
  await crux.restore(removedId);
  await native().restart();
  expect(
    (await exportCruxspace({ spaceId: space.id, expectedMemberIds })).manifest.members
      .map((member) => member.id)
      .sort(),
  ).toEqual([...expectedMemberIds].sort());
});

for (const cleanup of ['available', 'refused', 'member refused'] as const)
  it(`reports native second-member import refusal with cleanup ${cleanup}, preserving original work through restart and retry`, async () => {
    const { blob, manifest, space } = await packageOfWork();
    const originalIds = (await identities()).map((row) => (row as { id: string }).id);
    const originals = await Promise.all(
      manifest.members.map(async (member) => {
        const owner = await getServices().crux.findById(member.id);
        return {
          owner,
          head: await native().client.fileContent!.head(member.id),
          files: await getServices().artifact.findByResource('crux', member.id),
        };
      }),
    );
    const refusedTitle = manifest.members[1]!.title.replaceAll("'", "''");
    await native().faultSql(
      `CREATE TRIGGER refuse_second_member BEFORE INSERT ON cruxes WHEN NEW.title = '${refusedTitle}' BEGIN SELECT RAISE(ABORT, 'Second member storage refused'); END`,
    );
    if (cleanup !== 'available')
      await native().faultSql(
        `CREATE TRIGGER refuse_package_cleanup BEFORE DELETE ON cruxes ${cleanup === 'member refused' ? "WHEN OLD.kind IS NOT 'garden'" : ''} BEGIN SELECT RAISE(ABORT, 'Cleanup storage refused'); END`,
      );
    const error = await importCruxspace({ data: blob, mode: 'clone', name: 'Incoming work' }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(Error);
    if (cleanup === 'available') {
      expect((error as Error).message).toContain('Second member storage refused');
      expect((await identities()).map((row) => (row as { id: string }).id)).toEqual(originalIds);
    } else {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as Error).message).toContain('Garden "Incoming work"');
      expect((error as Error).message).toContain(`"${manifest.members[0]!.title}"`);
      expect((error as Error).message).toContain('Review and remove the partial Garden');
      const partial = (await listCruxspaces()).filter((item) => item.name === 'Incoming work');
      expect(partial).toHaveLength(1);
      expect(partial[0]!.cruxIds).toHaveLength(1);
      const imported = await getServices().crux.findById(partial[0]!.cruxIds[0]!);
      expect(readFileSync(join(imported.meta!.projectFolder as string, 'hello.txt'), 'utf8')).toBe(
        manifest.members[0]!.title,
      );
    }
    await native().faultSql('DROP TRIGGER refuse_second_member');
    if (cleanup !== 'available') await native().faultSql('DROP TRIGGER refuse_package_cleanup');
    await native().restart();
    for (const { owner, head, files } of originals) {
      expect(await native().client.fileContent!.head(owner.id)).toEqual(head);
      expect(await getServices().artifact.readContent(files[0]!)).toBe(owner.title);
      expect(readFileSync(join(owner.meta!.projectFolder as string, 'hello.txt'), 'utf8')).toBe(
        owner.title,
      );
    }
    expect((await getCruxspace(space.id)).cruxIds.sort()).toEqual(
      manifest.members.map((member) => member.id).sort(),
    );
    const partials = (await listCruxspaces()).filter((item) => item.name === 'Incoming work');
    expect(partials).toHaveLength(cleanup === 'available' ? 0 : 1);
    // Follow the reported recovery instruction, using the ordinary native
    // deletion command before deliberately requesting another independent copy.
    for (const partial of partials) {
      for (const member of partial.cruxIds) await getServices().crux.delete(member);
      await getServices().crux.delete(partial.id);
    }
    const retry = await importCruxspace({ data: blob, mode: 'clone', name: 'Incoming work' });
    expect(retry.members).toHaveLength(2);
    await native().restart();
    expect((await listCruxspaces()).filter((item) => item.name === 'Incoming work')).toHaveLength(
      1,
    );
    expect((await getCruxspace(space.id)).cruxIds.sort()).toEqual(
      manifest.members.map((member) => member.id).sort(),
    );
  });
