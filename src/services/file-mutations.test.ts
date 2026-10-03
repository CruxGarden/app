import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from '@/services';
import { createCruxStore } from '@/stores/cruxStore';

const native = localApiFixture();
beforeEach(() => initServices());
afterEach(() => vi.restoreAllMocks());
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

async function workspace() {
  const owner = await getServices().crux.create({ title: 'Protected files', type: 'workspace' });
  const folder = owner.meta!.projectFolder as string;
  const file = await getServices().artifact.create({
    resourceId: owner.id,
    content: 'At consent',
    meta: { path: 'target.txt' },
  });
  const data = createCruxStore();
  data.setState({ crux: owner, artifacts: [file] });
  return { owner, folder, file, data };
}

function delayedFile() {
  const file = new File(['Imported'], 'target.txt');
  let resolve!: (value: ArrayBuffer) => void;
  vi.spyOn(file, 'arrayBuffer').mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  return { file, release: () => resolve(new TextEncoder().encode('Imported').buffer) };
}

async function protectedFingerprints(id: string) {
  const content = native().client.fileContent!;
  const checkpoints = (await content.history(id)).checkpoints.filter(
    (entry) => entry.reason === 'safety',
  );
  return (
    await Promise.all(checkpoints.map((entry) => content.inspectCheckpoint(id, entry.id)))
  ).flatMap((entry) => entry.files.map((file) => file.fingerprint));
}

it('refuses an upload when its approved replacement changes while reading, then retains the new version on explicit retry', async () => {
  const { owner, folder, file, data } = await workspace();
  const incoming = delayedFile();
  const pending = data
    .getState()
    .uploadFiles([{ path: 'target.txt', file: incoming.file, expected: file }]);
  const newer = await getServices().artifact.create({
    resourceId: owner.id,
    expected: file,
    content: 'New indexed edit',
    meta: { path: 'target.txt' },
  });
  const head = await native().client.fileContent!.head(owner.id);
  incoming.release();
  await expect(pending).rejects.toThrow('target.txt');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('New indexed edit');
  expect(await native().client.fileContent!.head(owner.id)).toEqual(head);
  await native().restart();
  data.setState({ artifacts: [newer] });
  await data.getState().uploadFiles([{ path: 'target.txt', file: incoming.file, expected: newer }]);
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Imported');
  expect(await protectedFingerprints(owner.id)).toContain(hash('New indexed edit'));
});

it('keeps a newly occupied destination when the upload approved an absent path', async () => {
  const { owner, folder, data } = await workspace();
  const incoming = delayedFile();
  const pending = data
    .getState()
    .uploadFiles([{ path: 'new.txt', file: incoming.file, expected: null }]);
  await getServices().artifact.create({
    resourceId: owner.id,
    content: 'Appeared later',
    meta: { path: 'new.txt' },
  });
  incoming.release();
  await expect(pending).rejects.toThrow('new.txt');
  expect(readFileSync(join(folder, 'new.txt'), 'utf8')).toBe('Appeared later');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('At consent');
});

it('refuses to overwrite an unindexed external edit and leaves both disk and native selection intact', async () => {
  const { owner, folder, file, data } = await workspace();
  const incoming = delayedFile();
  const head = await native().client.fileContent!.head(owner.id);
  const pending = data
    .getState()
    .uploadFiles([{ path: 'target.txt', file: incoming.file, expected: file }]);
  writeFileSync(join(folder, 'target.txt'), 'External unindexed edit');
  incoming.release();
  await expect(pending).rejects.toThrow('target.txt');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('External unindexed edit');
  expect(await native().client.fileContent!.head(owner.id)).toEqual(head);
  expect(await getServices().artifact.readContent(file)).toBe('At consent');
  await native().restart();
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('External unindexed edit');
});

it.each(['write', 'delete'] as const)(
  'a native %s refusal leaves disk and selection untouched and permits retry after restart',
  async (operation) => {
    const { owner, folder, file, data } = await workspace();
    const head = await native().client.fileContent!.head(owner.id);
    await native().faultSql(
      "CREATE TRIGGER refuse_mutation BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Storage refused'); END",
    );
    const run = () =>
      operation === 'write'
        ? data
            .getState()
            .uploadFiles([
              { path: 'target.txt', file: new File(['Imported'], 'target.txt'), expected: file },
            ])
        : data.getState().deleteArtifact(file.id);
    await expect(run()).rejects.toThrow('target.txt');
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('At consent');
    expect(data.getState().artifacts.map((entry) => entry.id)).toContain(file.id);
    expect(await native().client.fileContent!.head(owner.id)).toEqual(head);
    await native().faultSql('DROP TRIGGER refuse_mutation');
    await native().restart();
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('At consent');
    await run();
    if (operation === 'write')
      expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Imported');
    else expect(existsSync(join(folder, 'target.txt'))).toBe(false);
    expect(await protectedFingerprints(owner.id)).toContain(hash('At consent'));
  },
);

it('refuses stale deletion of an external edit, then protects the ingested edit when deletion is requested again', async () => {
  const { owner, folder, file, data } = await workspace();
  const head = await native().client.fileContent!.head(owner.id);
  writeFileSync(join(folder, 'target.txt'), 'External before delete');
  await expect(data.getState().deleteArtifact(file.id)).rejects.toThrow('target.txt');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('External before delete');
  expect(await native().client.fileContent!.head(owner.id)).toEqual(head);
  await native().restart();
  // Ingestion records the bytes already on disk; a new user selection can then authorize deletion.
  const refreshed = await getServices().artifact.create({
    resourceId: owner.id,
    writeThrough: false,
    content: readFileSync(join(folder, 'target.txt'), 'utf8'),
    meta: { path: 'target.txt' },
  });
  data.setState({ artifacts: [refreshed] });
  await data.getState().deleteArtifact(refreshed.id);
  expect(existsSync(join(folder, 'target.txt'))).toBe(false);
  expect(await protectedFingerprints(owner.id)).toContain(hash('External before delete'));
});
