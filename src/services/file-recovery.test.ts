import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { join } from 'node:path';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from '@/services';
import { createCruxStore } from '@/stores/cruxStore';
import { createUIStore } from '@/stores/uiStore';
import { closeWorkspace, getWorkspace, openWorkspace } from '@/stores/workspaceRegistry';
import { documentsFor } from './workspace-documents';
import { pendingFileProjection } from './file-content';

const native = localApiFixture({ project: true });
beforeEach(() => initServices());
afterEach(() => vi.restoreAllMocks());
const pending = async (id: string) =>
  !!(await native().client.get('SELECT value FROM settings WHERE key = ?', [
    `cruxgarden:content-projection:${id}`,
  ]));
async function setup() {
  const owner = await getServices().crux.create({
    title: 'Recover admitted update',
    type: 'workspace',
  });
  const ui = createUIStore(owner.id);
  const data = createCruxStore(ui);
  data.setState({ crux: owner });
  return { owner, data, ui, folder: owner.meta!.projectFolder as string };
}
function refuseLinkOnce(target: string) {
  const original = fs.linkSync;
  let refused = false;
  vi.spyOn(fs, 'linkSync').mockImplementation((from, to) => {
    if (!refused && String(to) === target) {
      refused = true;
      throw new Error('Transient filesystem refusal');
    }
    return original(from, to);
  });
}

it('reports committed and refused uploads separately; explicit recovery finishes only the admitted file', async () => {
  const { owner, data, folder } = await setup();
  refuseLinkOnce(join(folder, 'first.txt'));
  const error = await data
    .getState()
    .uploadFiles([
      { file: new File(['First bytes'], 'first.txt'), path: 'first.txt' },
      { file: new File(['Second bytes'], 'second.txt'), path: 'second.txt' },
    ])
    .catch((error: unknown) => error);
  expect(pendingFileProjection(error)?.ownerId).toBe(owner.id);
  expect(String(error)).toContain('0 of 2 files added');
  expect(String(error)).toContain('1 saved in Garden');
  expect(String(error)).toContain('second.txt');
  expect(data.getState().uploadProgress).toBeNull();
  expect(await pending(owner.id)).toBe(true);
  const write = vi.spyOn(native().client.fileContent!, 'write');
  await data.getState().recoverFileUpdates(owner.id);
  expect(write).not.toHaveBeenCalled();
  expect(await pending(owner.id)).toBe(false);
  expect(data.getState().artifacts.map((file) => file.filename)).toEqual(['first.txt']);
  expect(fs.readFileSync(join(folder, 'first.txt'), 'utf8')).toBe('First bytes');
  expect(fs.existsSync(join(folder, 'second.txt'))).toBe(false);
  await native().restart();
  expect(
    await (
      await getServices().artifact.downloadBlob(
        (await getServices().artifact.findByResource('crux', owner.id))[0]!,
      )
    ).text(),
  ).toBe('First bytes');
});

it('closes only an absent live file tab after recovering a committed deletion', async () => {
  const { owner, data, ui, folder } = await setup();
  const artifact = getServices().artifact;
  const file = await artifact.create({
    resourceId: owner.id,
    content: 'Keep safety bytes',
    meta: { path: 'delete.txt' },
  });
  data.setState({ artifacts: [file] });
  ui.getState().openFile(file.id, 'delete.txt');
  const original = fs.renameSync;
  let refused = false;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (!refused && String(from) === join(folder, 'delete.txt')) {
      refused = true;
      throw new Error('Transient filesystem refusal');
    }
    return original(from, to);
  });
  const error = await data
    .getState()
    .deleteArtifacts([file.id])
    .catch((error: unknown) => error);
  expect(pendingFileProjection(error)?.ownerId).toBe(owner.id);
  expect(ui.getState().editor.tabs.map((tab) => tab.id)).toContain(file.id);
  await data.getState().recoverFileUpdates(owner.id);
  expect(await pending(owner.id)).toBe(false);
  expect(data.getState().artifacts).toEqual([]);
  expect(ui.getState().editor.tabs.map((tab) => tab.id)).not.toContain(file.id);
  expect(fs.existsSync(join(folder, 'delete.txt'))).toBe(false);
  const retained = fs.readdirSync(join(folder, '.crux-recovery', 'delete'));
  expect(retained).toHaveLength(1);
  await native().restart();
  expect(await artifact.findByResource('crux', owner.id)).toEqual([]);
  expect(fs.readdirSync(join(folder, '.crux-recovery', 'delete'))).toEqual(retained);
});

it('reopening the same workspace completes an admitted rename without another mutation', async () => {
  const { owner, folder } = await setup();
  const artifact = getServices().artifact;
  const file = await artifact.create({
    resourceId: owner.id,
    content: 'Original bytes',
    meta: { path: 'source.txt' },
  });
  const workspace = await openWorkspace(owner.id);
  refuseLinkOnce(join(folder, 'destination.txt'));
  const error = await artifact
    .update(file, { meta: { path: 'destination.txt' } })
    .catch((error: unknown) => error);
  expect(pendingFileProjection(error)?.paths).toEqual(['source.txt', 'destination.txt']);
  const rename = vi.spyOn(native().client.fileContent!, 'rename');
  expect(await openWorkspace(owner.id)).toBe(workspace);
  expect(rename).not.toHaveBeenCalled();
  expect(await pending(owner.id)).toBe(false);
  expect(workspace.data.getState().artifacts.map((file) => file.filename)).toEqual([
    'destination.txt',
  ]);
  expect(fs.readFileSync(join(folder, 'destination.txt'), 'utf8')).toBe('Original bytes');
});

it('preserves another owner and selected Growth while recovering the captured owner', async () => {
  const { owner, data, ui, folder } = await setup();
  const file = await getServices().artifact.create({
    resourceId: owner.id,
    content: 'Snapshot bytes',
    meta: { path: 'delete.txt' },
  });
  data.setState({
    artifacts: [file],
    workspaceArtifacts: [file],
    viewingSnapshotId: 'selected-growth',
  });
  ui.getState().openFile(file.id, 'delete.txt');
  vi.spyOn(native().client.fileContent!, 'finishProjection').mockRejectedValueOnce(
    new Error('Transient host refusal'),
  );
  await expect(getServices().artifact.delete(file)).rejects.toThrow('unfinished');
  await data.getState().recoverFileUpdates(owner.id);
  expect(data.getState().viewingSnapshotId).toBe('selected-growth');
  expect(data.getState().artifacts).toEqual([file]);
  expect(data.getState().workspaceArtifacts).toEqual([]);
  expect(ui.getState().editor.tabs.map((tab) => tab.id)).toContain(file.id);
  expect(fs.existsSync(join(folder, 'delete.txt'))).toBe(false);
  const other = await getServices().crux.create({ title: 'Other owner', type: 'workspace' });
  data.setState({ crux: other, artifacts: [], workspaceArtifacts: null, viewingSnapshotId: null });
  await data.getState().recoverFileUpdates(owner.id);
  expect(data.getState().crux?.id).toBe(other.id);
  expect(data.getState().artifacts).toEqual([]);
});

it('reconciles a later external edit after receipt replay without overwriting its bytes', async () => {
  const { owner, data, folder } = await setup();
  native().faultSql(`CREATE TRIGGER refuse_projection_ack BEFORE DELETE ON settings
    WHEN OLD.key = 'cruxgarden:content-projection:${owner.id}'
    BEGIN SELECT RAISE(ABORT, 'Transient acknowledgement refusal'); END`);
  await expect(
    data
      .getState()
      .uploadFiles([{ file: new File(['Admitted bytes'], 'receipt.txt'), path: 'receipt.txt' }]),
  ).rejects.toThrow('saved in Garden');
  expect(await pending(owner.id)).toBe(true);
  expect(fs.readFileSync(join(folder, 'receipt.txt'), 'utf8')).toBe('Admitted bytes');
  fs.writeFileSync(join(folder, 'receipt.txt'), 'Later external bytes');
  native().faultSql('DROP TRIGGER refuse_projection_ack');
  await data.getState().recoverFileUpdates(owner.id);
  expect(await pending(owner.id)).toBe(false);
  expect(fs.readFileSync(join(folder, 'receipt.txt'), 'utf8')).toBe('Later external bytes');
  expect(await getServices().artifact.readContent(data.getState().artifacts[0]!)).toBe(
    'Later external bytes',
  );
});

it('Save and close finishes a deferred upload before saving drafts and metadata, then reopens with both files', async () => {
  const { owner, folder } = await setup();
  const artifact = getServices().artifact;
  const file = await artifact.create({
    resourceId: owner.id,
    content: 'Before draft',
    meta: { path: 'draft.txt' },
  });
  const workspace = await openWorkspace(owner.id);
  workspace.ui.getState().openFile(file.id, 'draft.txt');
  const docs = documentsFor(workspace.data, workspace.ui);
  docs.hydrate(file, 'Before draft');
  docs.edit(file, 'Saved during close');
  refuseLinkOnce(join(folder, 'later.txt'));
  await expect(
    workspace.data
      .getState()
      .uploadFiles([{ file: new File(['Admitted upload'], 'later.txt'), path: 'later.txt' }]),
  ).rejects.toThrow('saved in Garden');
  const write = vi.spyOn(native().client.fileContent!, 'write');
  await closeWorkspace(owner.id, { documents: 'save' });
  expect(getWorkspace(owner.id)).toBeUndefined();
  expect(await pending(owner.id)).toBe(false);
  expect(write.mock.calls.map(([input]) => input.entry.path)).toEqual(['draft.txt']);
  const reopened = await openWorkspace(owner.id);
  expect(reopened).not.toBe(workspace);
  expect(
    reopened.data
      .getState()
      .artifacts.map((entry) => entry.filename)
      .sort(),
  ).toEqual(['draft.txt', 'later.txt']);
  expect(fs.readFileSync(join(folder, 'draft.txt'), 'utf8')).toBe('Saved during close');
  expect(fs.readFileSync(join(folder, 'later.txt'), 'utf8')).toBe('Admitted upload');
});

it('a close-time recovery refusal retains the workspace and dirty draft until explicit retry', async () => {
  const { owner, folder } = await setup();
  const file = await getServices().artifact.create({
    resourceId: owner.id,
    content: 'Original',
    meta: { path: 'draft.txt' },
  });
  const workspace = await openWorkspace(owner.id);
  workspace.ui.getState().openFile(file.id, 'draft.txt');
  const docs = documentsFor(workspace.data, workspace.ui);
  docs.hydrate(file, 'Original');
  docs.edit(file, 'Precious draft');
  const original = fs.linkSync;
  let refused = true;
  vi.spyOn(fs, 'linkSync').mockImplementation((from, to) => {
    if (refused && String(to) === join(folder, 'later.txt'))
      throw new Error('Host still unavailable');
    return original(from, to);
  });
  await expect(
    workspace.data
      .getState()
      .uploadFiles([{ file: new File(['Admitted upload'], 'later.txt'), path: 'later.txt' }]),
  ).rejects.toThrow('saved in Garden');
  await expect(closeWorkspace(owner.id, { documents: 'save' })).rejects.toThrow(
    'Host still unavailable',
  );
  expect(getWorkspace(owner.id)).toBe(workspace);
  expect(workspace.phase).toBe('ready');
  expect(workspace.data.getState().closing).toBe(false);
  expect(docs.get(file).getState().content).toBe('Precious draft');
  expect(docs.hasDirty()).toBe(true);
  expect(fs.readFileSync(join(folder, 'draft.txt'), 'utf8')).toBe('Original');
  refused = false;
  await closeWorkspace(owner.id, { documents: 'save' });
  expect(getWorkspace(owner.id)).toBeUndefined();
  expect(fs.readFileSync(join(folder, 'draft.txt'), 'utf8')).toBe('Precious draft');
});
