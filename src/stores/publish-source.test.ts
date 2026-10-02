import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCruxStore } from './cruxStore';
import { createUIStore } from './uiStore';
import { getServices, initServices } from '@/services';
import { documentsFor } from '@/services/workspace-documents';
import * as publish from '@/services/publish';
import * as cues from '@/services/cues';
import { openWorkspace, closeWorkspace } from './workspaceRegistry';
import { runGardenTool } from '@/ai/garden-tools';

beforeEach(async () => {
  await initServices();
  vi.spyOn(cues, 'playCue').mockImplementation(async () => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function draft() {
  const crux = await getServices().crux.create({ title: 'Source to share' });
  const file = await getServices().artifact.create({
    resourceId: crux.id,
    content: '<h1>Saved</h1>',
    meta: { path: 'index.html' },
  });
  const ui = createUIStore();
  const store = createCruxStore(ui);
  store.setState({ crux, artifacts: [file] });
  const documents = documentsFor(store, ui);
  documents.hydrate(file, '<h1>Saved</h1>');
  documents.edit(file, '<h1>Visible draft</h1>');
  return { crux, file, store, documents };
}

it('shares the visible source draft through the captured workspace owner', async () => {
  const { store, file, documents } = await draft();
  let received = '';
  vi.spyOn(publish, 'publishPipeline').mockImplementation(async (crux, artifacts) => {
    const selected = artifacts.find((a) => a.id === file.id)!;
    received = await (await getServices().artifact.downloadBlob(selected)).text();
    return crux;
  });
  expect(await store.getState().publishCrux()).toBe(true);
  expect(received).toBe('<h1>Visible draft</h1>');
  expect(documents.dirty(file)).toBe(false);
});

it('refuses before remote changes when saving fails, retains the draft and permits retry', async () => {
  const { store, file, documents } = await draft();
  const pipeline = vi.spyOn(publish, 'publishPipeline').mockImplementation(async (crux) => crux);
  const save = vi.spyOn(store.getState(), 'saveArtifactContent').mockResolvedValue(undefined);
  expect(await store.getState().publishCrux()).toBe(false);
  expect(pipeline).not.toHaveBeenCalled();
  expect(documents.get(file).getState().content).toBe('<h1>Visible draft</h1>');
  expect(documents.dirty(file)).toBe(true);
  save.mockRestore();
  expect(await store.getState().publishCrux()).toBe(true);
  expect(documents.dirty(file)).toBe(false);
});

it('refuses a workspace owner change during preparation without publishing the other Crux', async () => {
  const { store, documents, file } = await draft();
  const other = await getServices().crux.create({ title: 'Other' });
  vi.spyOn(store.getState(), 'saveMeta').mockImplementation(async () => {
    store.setState({ crux: other, artifacts: [] });
  });
  const pipeline = vi.spyOn(publish, 'publishPipeline').mockImplementation(async (crux) => crux);
  expect(await store.getState().publishCrux()).toBe(false);
  expect(pipeline).not.toHaveBeenCalled();
  expect(store.getState().crux?.id).toBe(other.id);
  expect(documents.get(file).getState().content).toBe('<h1>Visible draft</h1>');
});

it('keeps typing that arrives during a save and refuses to share an older source revision', async () => {
  const { store, documents, file } = await draft();
  const save = store.getState().saveArtifactContent;
  vi.spyOn(store.getState(), 'saveArtifactContent').mockImplementation(async (...args) => {
    const result = await save(...args);
    documents.edit(file, '<h1>Newer typing</h1>');
    return result;
  });
  const pipeline = vi.spyOn(publish, 'publishPipeline').mockImplementation(async (crux) => crux);
  expect(await store.getState().publishCrux()).toBe(false);
  expect(pipeline).not.toHaveBeenCalled();
  expect(documents.get(file).getState().content).toBe('<h1>Newer typing</h1>');
  expect(documents.dirty(file)).toBe(true);
});

it('the Garden publishing tool saves the same workspace source before sharing', async () => {
  const { crux, file } = await draft();
  const workspace = await openWorkspace(crux.id);
  const documents = documentsFor(workspace.data, workspace.ui);
  documents.hydrate(file, '<h1>Saved</h1>');
  documents.edit(file, '<h1>Garden draft</h1>');
  let received = '';
  vi.spyOn(publish, 'publishPipeline').mockImplementation(async (owner, files) => {
    received = await (
      await getServices().artifact.downloadBlob(files.find((a) => a.id === file.id)!)
    ).text();
    return owner;
  });
  try {
    expect(await runGardenTool('publish_crux', { cruxId: crux.id })).toContain('Published');
    expect(received).toBe('<h1>Garden draft</h1>');
    expect(documents.dirty(file)).toBe(false);
  } finally {
    await closeWorkspace(crux.id, { documents: 'discard' });
  }
});

it('queued metadata cannot write into a later workspace owner', async () => {
  const { store, crux } = await draft();
  const other = await getServices().crux.create({ title: 'Later owner' });
  const update = getServices().crux.update.bind(getServices().crux);
  let entered!: () => void, resume!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const writes: string[] = [];
  vi.spyOn(getServices().crux, 'update').mockImplementation(async (id, input) => {
    writes.push(id);
    entered();
    await paused;
    return update(id, input);
  });
  const first = store.getState().saveMeta();
  await started;
  const queued = store.getState().saveMeta();
  const refused = expect(queued).rejects.toThrow('workspace changed');
  store.setState({ crux: other, artifacts: [] });
  resume();
  await first;
  await refused;
  expect(writes).toEqual([crux.id]);
  expect(store.getState().crux?.id).toBe(other.id);
});

it('refuses sharing while historical content is selected without saving the live draft', async () => {
  const { store, documents, file } = await draft();
  store.setState({ viewingSnapshotId: 'history' });
  const pipeline = vi.spyOn(publish, 'publishPipeline').mockImplementation(async (crux) => crux);
  expect(await store.getState().publishCrux()).toBe(false);
  expect(pipeline).not.toHaveBeenCalled();
  expect(documents.dirty(file)).toBe(true);
  expect(documents.get(file).getState().content).toBe('<h1>Visible draft</h1>');
});
