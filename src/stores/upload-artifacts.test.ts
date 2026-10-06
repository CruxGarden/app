import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { createCruxStore } from './cruxStore';

const native = localApiFixture();
beforeEach(() => initServices());
afterEach(() => vi.restoreAllMocks());

async function workspace(title = 'Upload target') {
  const owner = await getServices().crux.create({ title });
  const data = createCruxStore();
  data.setState({ crux: owner });
  return { owner, data };
}
const input = (path: string, body: string) => ({ path, file: new File([body], path) });
async function saved(id: string) {
  const { artifact } = getServices();
  return Object.fromEntries(
    await Promise.all(
      (await artifact.findByResource('crux', id)).map(async (file) => [
        pathOf(file),
        await (await artifact.downloadBlob(file)).text(),
      ]),
    ),
  );
}

it('reports partial native refusal, retains successful bytes and retries after restart', async () => {
  const { owner, data } = await workspace();
  // The first content head inserts successfully; the second write is refused.
  await native().faultSql(
    "CREATE TRIGGER refuse_upload BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Storage refused'); END",
  );
  await expect(
    data
      .getState()
      .uploadFiles([input('first.txt', 'Keep first'), input('second.txt', 'Retry second')]),
  ).rejects.toThrow(/second\.txt/);
  expect(data.getState().uploadProgress).toBeNull();
  expect(data.getState().artifacts.map(pathOf)).toEqual(['first.txt']);
  expect(await saved(owner.id)).toEqual({ 'first.txt': 'Keep first' });
  await native().faultSql('DROP TRIGGER refuse_upload');
  await native().restart();
  expect(await saved(owner.id)).toEqual({ 'first.txt': 'Keep first' });
  await data.getState().uploadFiles([input('second.txt', 'Retry second')]);
  expect(data.getState().uploadProgress).toBeNull();
  await native().restart();
  expect(await saved(owner.id)).toEqual({
    'first.txt': 'Keep first',
    'second.txt': 'Retry second',
  });
});

it('reports every failed path when native storage refuses the whole upload', async () => {
  const { owner, data } = await workspace();
  await native().faultSql(
    "CREATE TRIGGER refuse_upload BEFORE INSERT ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Storage refused'); END",
  );
  const result = data
    .getState()
    .uploadFiles([input('first.txt', 'First'), input('second.txt', 'Second')]);
  await expect(result).rejects.toThrow(/first\.txt.*second\.txt/s);
  expect(data.getState().uploadProgress).toBeNull();
  expect(data.getState().artifacts).toEqual([]);
  expect(await saved(owner.id)).toEqual({});
});

it('captures input paths and ownership before file reads and leaves a later workspace untouched', async () => {
  const { owner, data } = await workspace();
  const other = await getServices().crux.create({ title: 'Other work' });
  const otherFile = await getServices().artifact.create({
    resourceId: other.id,
    content: 'Other bytes',
    meta: { path: 'other.txt' },
  });
  const entries = [input('first.txt', 'First bytes'), input('second.txt', 'Second bytes')];
  let release!: (bytes: ArrayBuffer) => void;
  vi.spyOn(entries[0]!.file, 'arrayBuffer').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = data.getState().uploadFiles(entries);
  entries[1]!.path = 'redirected.txt';
  entries.push(input('unexpected.txt', 'Must not import'));
  data.setState({ crux: other, artifacts: [otherFile] });
  release(new TextEncoder().encode('First bytes').buffer);
  await pending;
  expect(await saved(owner.id)).toEqual({
    'first.txt': 'First bytes',
    'second.txt': 'Second bytes',
  });
  expect(await saved(other.id)).toEqual({ 'other.txt': 'Other bytes' });
  expect(data.getState().artifacts).toEqual([otherFile]);
  expect(data.getState().uploadProgress).toBeNull();
});

it('keeps a history selection intact when an admitted upload finishes', async () => {
  const { owner, data } = await workspace();
  const original = await getServices().artifact.create({
    resourceId: owner.id,
    content: 'Before',
    meta: { path: 'existing.txt' },
  });
  data.setState({ artifacts: [original] });
  const entry = input('new.txt', 'New bytes');
  let release!: (bytes: ArrayBuffer) => void;
  vi.spyOn(entry.file, 'arrayBuffer').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = data.getState().uploadFiles([entry]);
  const historical = { ...original, resourceId: crypto.randomUUID() };
  data.setState({
    artifacts: [historical],
    workspaceArtifacts: [original],
    viewingSnapshotId: historical.resourceId,
  });
  release(new TextEncoder().encode('New bytes').buffer);
  await pending;
  expect(data.getState().artifacts).toEqual([historical]);
  expect(data.getState().workspaceArtifacts?.map(pathOf).sort()).toEqual([
    'existing.txt',
    'new.txt',
  ]);
  expect(await saved(owner.id)).toEqual({ 'existing.txt': 'Before', 'new.txt': 'New bytes' });
});

it('keeps a newer upload visible while an earlier selection finishes', async () => {
  const { owner, data } = await workspace();
  const first = input('first.txt', 'First');
  const second = input('second.txt', 'Second');
  let releaseFirst!: (bytes: ArrayBuffer) => void;
  let releaseSecond!: (bytes: ArrayBuffer) => void;
  vi.spyOn(first.file, 'arrayBuffer').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseFirst = resolve;
      }),
  );
  vi.spyOn(second.file, 'arrayBuffer').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseSecond = resolve;
      }),
  );
  const one = data.getState().uploadFiles([first]);
  const two = data.getState().uploadFiles([second]);
  releaseFirst(new TextEncoder().encode('First').buffer);
  await one;
  expect(data.getState().uploadProgress?.currentFile).toBe('second.txt');
  releaseSecond(new TextEncoder().encode('Second').buffer);
  await two;
  expect(data.getState().uploadProgress).toBeNull();
  expect(await saved(owner.id)).toEqual({ 'first.txt': 'First', 'second.txt': 'Second' });
});

it.each(['history', 'closing'])('refuses a new upload while the workspace is %s', async (state) => {
  const { owner, data } = await workspace();
  data.setState(
    state === 'history' ? { viewingSnapshotId: crypto.randomUUID() } : { closing: true },
  );
  await expect(
    data.getState().uploadFiles([input('refused.txt', 'Do not write')]),
  ).rejects.toThrow();
  expect(await saved(owner.id)).toEqual({});
  expect(data.getState().uploadProgress).toBeNull();
});

it('captures direct binary upload owner and metadata before reading its Blob', async () => {
  const { owner } = await workspace();
  const other = await getServices().crux.create({ title: 'Other work' });
  const blob = new Blob(['Original bytes']);
  let release!: (bytes: ArrayBuffer) => void;
  vi.spyOn(blob, 'arrayBuffer').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const request = {
    resourceId: owner.id,
    blob,
    meta: { path: 'original.bin', provenance: { label: 'Original' } },
  };
  const pending = getServices().artifact.upload(request);
  request.resourceId = other.id;
  request.meta.path = 'redirected.bin';
  request.meta.provenance.label = 'Later';
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  release(new TextEncoder().encode('Original bytes').buffer);
  const result = await pending;
  expect(result.resourceId).toBe(owner.id);
  expect(result.meta).toMatchObject({ path: 'original.bin', provenance: { label: 'Original' } });
  expect(await saved(owner.id)).toEqual({ 'original.bin': 'Original bytes' });
  expect(await saved(other.id)).toEqual({});
});
