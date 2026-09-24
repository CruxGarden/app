import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getServices, initServices } from '@/services';
import { createCruxStore } from './cruxStore';
import { createUIStore } from './uiStore';

beforeEach(() => initServices('local'));
afterEach(() => vi.restoreAllMocks());

async function workspace() {
  const { crux, artifact } = getServices();
  const owner = await crux.create({ title: 'Delete several files' });
  const files = await Promise.all(
    ['remove.txt', 'keep.txt'].map((path) =>
      artifact.create({ resourceId: owner.id, content: path, meta: { path } }),
    ),
  );
  const ui = createUIStore();
  const data = createCruxStore(ui);
  data.setState({ crux: owner, artifacts: files });
  for (const file of files) ui.getState().openFile(file.id, file.filename!);
  return { owner, files, ui, data, artifact };
}

it('reports a partial failure and keeps the refused file and its tab available for retry', async () => {
  const { files, ui, data, artifact } = await workspace();
  const remove = artifact.delete.bind(artifact);
  const spy = vi.spyOn(artifact, 'delete').mockImplementation(async (file) => {
    if (typeof file !== 'string' && file.id === files[1]!.id) throw new Error('Disk unavailable');
    await remove(file);
  });
  await expect(data.getState().deleteArtifacts(files.map((file) => file.id))).rejects.toThrow(
    'keep.txt',
  );
  expect(data.getState().artifacts).toEqual([files[1]]);
  expect(ui.getState().editor.tabs.map((tab) => tab.id)).toEqual([files[1]!.id]);
  expect(await artifact.findByResource('crux', files[0]!.resourceId)).toEqual([files[1]]);
  spy.mockRestore();
  await data.getState().deleteArtifacts([files[1]!.id]);
  expect(data.getState().artifacts).toEqual([]);
  expect(ui.getState().editor.tabs).toEqual([]);
});

it('captures one selection and refuses missing files before deleting anything', async () => {
  const { files, data, artifact } = await workspace();
  const spy = vi.spyOn(artifact, 'delete');
  await expect(data.getState().deleteArtifacts([files[0]!.id, 'missing'])).rejects.toThrow(
    'selected file',
  );
  expect(spy).not.toHaveBeenCalled();
  expect(data.getState().artifacts).toEqual(files);
});

it('does not delete retained history when the live file has the same logical ID', async () => {
  const { files, data, artifact } = await workspace();
  const historical = files.map((file) => ({ ...file, resourceId: 'snapshot' }));
  data.setState({
    artifacts: historical,
    workspaceArtifacts: files,
    viewingSnapshotId: 'snapshot',
  });
  const spy = vi.spyOn(artifact, 'delete');
  await expect(data.getState().deleteArtifact(files[0]!.id)).rejects.toThrow('read-only');
  expect(spy).not.toHaveBeenCalled();
  expect(data.getState().artifacts).toEqual(historical);
  expect(data.getState().workspaceArtifacts).toEqual(files);
});

it('finishes a captured live deletion without removing a historical file opened while it waits', async () => {
  const { files, data, ui, artifact } = await workspace();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const remove = artifact.delete.bind(artifact);
  vi.spyOn(artifact, 'delete').mockImplementation(async (file) => {
    await gate;
    await remove(file);
  });
  const pending = data.getState().deleteArtifact(files[0]!.id);
  const historical = files.map((file) => ({ ...file, resourceId: 'snapshot' }));
  data.setState({
    artifacts: historical,
    workspaceArtifacts: files,
    viewingSnapshotId: 'snapshot',
  });
  release();
  await pending;
  expect(data.getState().artifacts).toEqual(historical);
  expect(data.getState().workspaceArtifacts).toEqual([files[1]]);
  expect(ui.getState().editor.tabs.map((tab) => tab.id)).toContain(files[0]!.id);
});
