import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from '@/services';
import { createCruxStore } from './cruxStore';

const native = localApiFixture();
beforeEach(() => initServices());
afterEach(() => vi.restoreAllMocks());

async function editor() {
  const { crux, artifact } = getServices();
  const owner = await crux.create({ title: 'Routine editor history', type: 'workspace' });
  const file = await artifact.create({
    resourceId: owner.id,
    content: 'Initial draft',
    meta: { path: 'draft.txt' },
  });
  const data = createCruxStore();
  data.setState({ crux: owner, artifacts: [file] });
  return { owner, file, data, content: native().client.fileContent! };
}

it('coalesces repeated actual editor saves without making permanent safety copies', async () => {
  const { owner, file, data, content } = await editor();
  const started = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(started);
  for (let save = 1; save <= 24; save++)
    await data.getState().saveArtifactContent(file.id, `Draft ${save}`);

  const history = await content.history(owner.id);
  expect(readFileSync(join(owner.meta!.projectFolder as string, 'draft.txt'), 'utf8')).toBe(
    'Draft 24',
  );
  expect(await getServices().artifact.readContent(data.getState().artifacts[0]!)).toBe('Draft 24');
  expect(history.checkpoints.filter((checkpoint) => checkpoint.reason === 'autosave')).toHaveLength(
    1,
  );
  expect(history.checkpoints.filter((checkpoint) => checkpoint.reason === 'safety')).toEqual([]);
});

it('keeps shared binary tool saves in automatic history unless replacement is explicitly requested', async () => {
  const { owner, content } = await editor();
  const artifact = getServices().artifact;
  let current = await artifact.upload({
    resourceId: owner.id,
    blob: new Blob([new Uint8Array([0, 1])]),
    meta: { path: 'drawing.png' },
  });
  for (let save = 2; save <= 5; save++)
    current = await artifact.upload({
      resourceId: owner.id,
      expected: current,
      blob: new Blob([new Uint8Array([0, save])]),
      meta: { path: 'drawing.png' },
    });
  expect(new Uint8Array(await (await artifact.downloadBlob(current)).arrayBuffer())).toEqual(
    new Uint8Array([0, 5]),
  );
  const history = await content.history(owner.id);
  expect(history.checkpoints.filter((checkpoint) => checkpoint.reason === 'autosave')).toHaveLength(
    1,
  );
  expect(history.checkpoints.filter((checkpoint) => checkpoint.reason === 'safety')).toEqual([]);
});

it('bounds routine editor history at twenty while keeping explicit Replace recoverable', async () => {
  const { owner, file, data, content } = await editor();
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  await data.getState().saveArtifactContent(file.id, 'Before explicit Replace');
  const beforeReplace = data.getState().artifacts[0]!;
  await data.getState().uploadFiles([
    {
      path: 'draft.txt',
      file: new File(['Uploaded replacement'], 'draft.txt'),
      expected: beforeReplace,
    },
  ]);
  const afterReplace = await content.history(owner.id);
  const retained = await Promise.all(
    afterReplace.checkpoints
      .filter((checkpoint) => checkpoint.reason === 'safety')
      .map(async (checkpoint) => ({
        checkpoint,
        files: (await content.inspectCheckpoint(owner.id, checkpoint.id)).files,
      })),
  );
  const replaced = retained.find(({ files }) =>
    files.some((entry) => entry.fingerprint === beforeReplace.fingerprint),
  );
  expect(replaced, 'Replace must protect the exact approved previous bytes').toBeDefined();

  for (let save = 1; save <= 25; save++) {
    now += 60_001;
    await data.getState().saveArtifactContent(file.id, `Later draft ${save}`);
  }
  await native().restart();
  const reopened = native().client.fileContent!;
  const history = await reopened.history(owner.id);
  expect(history.checkpoints.filter((checkpoint) => checkpoint.reason === 'autosave')).toHaveLength(
    20,
  );
  expect(history.checkpoints.filter((checkpoint) => checkpoint.reason === 'safety')).toEqual([
    replaced!.checkpoint,
  ]);
  expect((await reopened.inspectCheckpoint(owner.id, replaced!.checkpoint.id)).files).toEqual(
    replaced!.files,
  );
  expect(readFileSync(join(owner.meta!.projectFolder as string, 'draft.txt'), 'utf8')).toBe(
    'Later draft 25',
  );
});
