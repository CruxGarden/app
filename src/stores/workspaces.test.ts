import { useGardenStore } from './gardenStore';
import { newTurnJob } from '@/services/turn-jobs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCruxStore } from './cruxStore';
import { createUIStore } from './uiStore';
import {
  activateWorkspace,
  allWorkspaces,
  closeWorkspace,
  getWorkspace,
  leaveWorkspaceView,
  openWorkspace,
  parseOpenWorkspaces,
  useWorkspaceRegistry,
  workspaceTending,
} from './workspaceRegistry';
import { validateTendingTarget, stopTendingTarget } from '@/services/tending-actions';
import { getServices, initServices } from '@/services';
import { documentsFor } from '@/services/workspace-documents';
import { recentOrder, nextRecent } from '@/lib/workspace-switching';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  await initServices('local');
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
  useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
});
async function pair() {
  const service = getServices();
  const [a, b] = await Promise.all([
    service.crux.create({ title: 'A' }),
    service.crux.create({ title: 'B' }),
  ]);
  const [fa, fb] = await Promise.all([
    service.artifact.create({
      resourceId: a.id,
      content: 'A original',
      meta: { path: 'same.txt' },
    }),
    service.artifact.create({
      resourceId: b.id,
      content: 'B original',
      meta: { path: 'same.txt' },
    }),
  ]);
  const [wa, wb] = await Promise.all([openWorkspace(a.id), openWorkspace(b.id)]);
  return { a, b, fa, fb, wa, wb, service };
}
describe('independent Crux workspaces', () => {
  it('deduplicates concurrent first opens and keeps independent data and UI', async () => {
    const { a, b, wa, wb, fa } = await pair();
    expect(await openWorkspace(a.id)).toBe(wa);
    expect(await Promise.all([openWorkspace(a.id), openWorkspace(a.id)])).toEqual([wa, wa]);
    wa.ui.getState().openFile(fa.id, 'same.txt');
    wa.ui.getState().setComposerDraft('draft A');
    wa.data.getState().appendStreamContent('response A');
    await activateWorkspace(b.id);
    await activateWorkspace(a.id);
    expect(wa.ui.getState().composerDraft).toBe('draft A');
    expect(wb.ui.getState().editor.tabs).toEqual([]);
    expect(wb.data.getState().streamingContent).toBe('');
  });
  it('a slow A open cannot steal focus from a later B activation', async () => {
    const { a, b, service } = await pair();
    await closeWorkspace(a.id);
    await closeWorkspace(b.id);
    const gate = deferred();
    const original = service.crux.findById.bind(service.crux);
    vi.spyOn(service.crux, 'findById').mockImplementation(async (id) => {
      if (id === a.id) await gate.promise;
      return original(id);
    });
    const slow = activateWorkspace(a.id);
    await activateWorkspace(b.id);
    gate.resolve();
    await slow;
    expect(useWorkspaceRegistry.getState().activeId).toBe(b.id);
  });
  it('retains drafts when leaving the builder and closes only the named workspace', async () => {
    const { a, b, wa, wb } = await pair();
    wa.ui.getState().setComposerDraft('unsent A');
    wb.ui.getState().setComposerDraft('unsent B');
    await activateWorkspace(b.id);
    leaveWorkspaceView();
    expect(getWorkspace(a.id)).toBe(wa);
    await closeWorkspace(a.id);
    expect(getWorkspace(a.id)).toBeUndefined();
    expect(getWorkspace(b.id)).toBe(wb);
    expect(wb.ui.getState().composerDraft).toBe('unsent B');
  });
  it('delete approval cancellation settles only its owning store', async () => {
    const { wa, wb } = await pair();
    const pa = wa.data.getState().requestDeleteApproval('same-id', 'same.txt');
    let settled = false;
    const pb = wb.data
      .getState()
      .requestDeleteApproval('same-id', 'same.txt')
      .then((v) => {
        settled = true;
        return v;
      });
    wa.data.getState().cancelPendingDeletes();
    expect(await pa).toBe(false);
    await Promise.resolve();
    expect(settled).toBe(false);
    wb.data.getState().dismissDelete('same-id');
    expect(await pb).toBe(false);
  });
  it('Agent Host approval cancellation is scoped as well', async () => {
    const { wa, wb, a, b } = await pair();
    const pa = wa.ui
      .getState()
      .requestAgentApproval({ cruxId: a.id, agent: 'test', action: 'publish' });
    const pb = wb.ui
      .getState()
      .requestAgentApproval({ cruxId: b.id, agent: 'test', action: 'publish' });
    wa.ui.getState().cancelApprovals();
    expect(await pa).toBe(false);
    expect(wb.ui.getState().pendingAgentApprovals).toHaveLength(1);
    wb.ui.getState().resolveAgentApproval(wb.ui.getState().pendingAgentApprovals[0]!.id, true);
    expect(await pb).toBe(true);
  });
  it('late metadata writes in A do not affect B and preserve later A settings', async () => {
    const { a, b, wa, wb, service } = await pair();
    const gate = deferred();
    const original = service.crux.update.bind(service.crux);
    let first = true;
    vi.spyOn(service.crux, 'update').mockImplementation(async (id, dto) => {
      if (id === a.id && first) {
        first = false;
        await gate.promise;
      }
      return original(id, dto);
    });
    wa.data.getState().patchCruxMeta({ one: 1 });
    const save = wa.data.getState().saveMeta();
    await Promise.resolve();
    await activateWorkspace(b.id);
    wa.data.getState().patchCruxMeta({ two: 2 });
    const save2 = wa.data.getState().saveMeta();
    gate.resolve();
    await Promise.all([save, save2]);
    const stored = await service.crux.findById(a.id);
    expect(stored.meta).toMatchObject({ one: 1, two: 2 });
    expect(wb.data.getState().crux?.title).toBe('B');
  });
  it('reopening gets a fresh lifetime rather than reusing disposed state', async () => {
    const { a, wa } = await pair();
    await closeWorkspace(a.id);
    const reopened = await openWorkspace(a.id);
    wa.data.getState().appendStreamContent('late old token');
    expect(reopened.data.getState().streamingContent).toBe('');
    expect(reopened).not.toBe(wa);
  });
});
describe('retained documents and trustworthy saves', () => {
  it('a delayed A save writes A; newer A typing stays dirty while B is visible', async () => {
    const { a, b, fa, fb, wa, wb, service } = await pair();
    const docs = documentsFor(wa.data, wa.ui);
    docs.hydrate(fa, 'A original');
    docs.edit(fa.id, 'A save');
    const gate = deferred();
    const original = service.artifact.create.bind(service.artifact);
    vi.spyOn(service.artifact, 'create').mockImplementation(async (dto) => {
      if (dto.resourceId === a.id) await gate.promise;
      return original(dto);
    });
    const save = docs.save(fa.id);
    await Promise.resolve();
    await activateWorkspace(b.id);
    docs.edit(fa.id, 'A newer typing');
    gate.resolve();
    await save;
    expect(await service.artifact.readContent(fa.id)).toBe('A save');
    expect(await service.artifact.readContent(fb.id)).toBe('B original');
    expect(docs.get(fa.id).getState().content).toBe('A newer typing');
    expect(docs.dirty(fa.id)).toBe(true);
    expect(wb.data.getState().artifacts[0]?.fingerprint).toBe(fb.fingerprint);
  });
  it('a failed save prevents closing and retains the buffer', async () => {
    const { a, fa, wa } = await pair();
    const docs = documentsFor(wa.data, wa.ui);
    docs.hydrate(fa, 'A original');
    docs.edit(fa.id, 'precious draft');
    vi.spyOn(getServices().artifact, 'create').mockRejectedValue(new Error('disk full'));
    await expect(closeWorkspace(a.id, { documents: 'save' })).rejects.toThrow('disk full');
    expect(getWorkspace(a.id)).toBe(wa);
    expect(docs.get(fa.id).getState().content).toBe('precious draft');
    expect(docs.hasDirty()).toBe(true);
  });
  it('keeps a dirty buffer when external content changes, requiring explicit overwrite', async () => {
    const { fa, wa, service, a } = await pair();
    const docs = documentsFor(wa.data, wa.ui);
    docs.hydrate(fa, 'A original');
    docs.edit(fa.id, 'local');
    const external = await service.artifact.create({
      resourceId: a.id,
      content: 'external',
      meta: { path: 'same.txt' },
    });
    docs.hydrate(external, 'external');
    await wa.data.getState().refreshArtifacts();
    expect(docs.get(fa.id).getState()).toMatchObject({ content: 'local', conflict: true });
    await expect(docs.save(fa.id)).rejects.toThrow('changed outside');
    await docs.save(fa.id, true);
    expect(await service.artifact.readContent(fa.id)).toBe('local');
  });
  it('refuses to close unsaved documents without a save/discard decision', async () => {
    const { a, fa, wa } = await pair();
    const docs = documentsFor(wa.data, wa.ui);
    docs.hydrate(fa, 'A original');
    docs.edit(fa.id, 'draft');
    await expect(closeWorkspace(a.id)).rejects.toThrow('Save or discard');
  });
  it('supports independent factories without a visible workspace', () => {
    const ua = createUIStore();
    const ub = createUIStore();
    const a = createCruxStore(ua);
    const b = createCruxStore(ub);
    a.getState().addMessage({ role: 'user', content: 'A' });
    b.getState().addMessage({ role: 'user', content: 'B' });
    expect(a.getState().messages.map((m) => m.content)).toEqual(['A']);
    expect(b.getState().messages.map((m) => m.content)).toEqual(['B']);
  });
});
describe('switching and restore rules', () => {
  it('deduplicates and validates persisted open IDs', () => {
    expect(parseOpenWorkspaces('{broken')).toEqual({ ids: [], active: null });
    expect(parseOpenWorkspaces(JSON.stringify({ version: 2, openCruxIds: ['a'] }))).toEqual({
      ids: [],
      active: null,
    });
    expect(
      parseOpenWorkspaces(
        JSON.stringify({
          version: 1,
          openCruxIds: ['a', 'a', null, '', 'b'],
          lastActiveCruxId: 'missing',
        }),
      ),
    ).toEqual({ ids: ['a', 'b'], active: null });
  });
  it('keeps a frozen MRU traversal independent of opening order', () => {
    const ids = ['a', 'b', 'c'];
    expect(recentOrder(ids, ['b', 'a', 'gone'])).toEqual(['b', 'a', 'c']);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(nextRecent(0, 1, 3)).toBe(1);
    expect(nextRecent(0, -1, 3)).toBe(2);
    expect(nextRecent(0, 1, 0)).toBe(-1);
    expect(nextRecent(0, 1, 1)).toBe(0);
  });
});

describe('workspace lifecycle boundaries', () => {
  it('refuses a hidden stale document save even before its editor remounts', async () => {
    const { wa, fa, service } = await pair();
    const docs = documentsFor(wa.data, wa.ui);
    docs.hydrate(fa, 'A original');
    docs.edit(fa.id, 'unsaved A');
    await service.artifact.create({
      resourceId: fa.resourceId,
      content: 'external A',
      meta: { path: 'same.txt' },
    });
    await wa.data.getState().refreshArtifacts();
    await expect(closeWorkspace(wa.id, { documents: 'save' })).rejects.toThrow('changed outside');
    expect(docs.get(fa.id).getState().content).toBe('unsaved A');
    expect(await service.artifact.readContent(fa.id)).toBe('external A');
    expect(getWorkspace(wa.id)).toBe(wa);
  });
  it('keeps the historical projection unchanged when live work updates Artifacts and conversation', async () => {
    const { wa, fa } = await pair();
    await wa.data.getState().createSnapshot({ silent: true });
    const snapshot = wa.data.getState().growths[0]!;
    await wa.data.getState().viewSnapshot(snapshot.targetId, 0);
    const historical = wa.data.getState().artifacts;
    wa.data.getState().addMessage({ role: 'assistant', content: 'A background completion' });
    wa.data.getState().upsertArtifact({ ...fa, filename: 'live.txt' });
    expect(wa.data.getState().artifacts).toBe(historical);
    await wa.data.getState().exitSnapshotView();
    expect(wa.data.getState().artifacts.find((a) => a.id === fa.id)?.filename).toBe('live.txt');
    expect(wa.data.getState().messages.at(-1)?.content).toBe('A background completion');
  });
  it('keeps a hidden Notes Crux manifest current and drains it on close', async () => {
    const service = getServices();
    const notes = await service.crux.create({ title: 'Notes', kind: 'notes' });
    const w = await openWorkspace(notes.id);
    await w.data.getState().createFile('notes/first.md', 'First');
    leaveWorkspaceView();
    await w.data.getState().createFile('notes/second.md', 'Second');
    await closeWorkspace(notes.id);
    const artifacts = await service.artifact.findByResource('crux', notes.id);
    const manifest = artifacts.find((a) => a.meta?.path === 'manifest.json')!;
    expect(JSON.parse(await service.artifact.readContent(manifest.id)).files).toEqual([
      'notes/first.md',
      'notes/second.md',
    ]);
  });
});

it('a delayed rename preserves metadata arriving from its background turn', async () => {
  const { wa, service } = await pair();
  const gate = deferred();
  const started = deferred();
  const update = service.crux.update.bind(service.crux);
  vi.spyOn(service.crux, 'update').mockImplementation(async (id, dto) => {
    if (dto.title === 'Renamed A') {
      started.resolve();
      await gate.promise;
    }
    return update(id, dto);
  });
  const renamed = wa.data.getState().updateCrux({ title: 'Renamed A' });
  await started.promise;
  wa.data.getState().patchCruxMeta({ backgroundEvidence: 'newer than rename' });
  gate.resolve();
  await renamed;
  expect(wa.data.getState().crux?.meta?.backgroundEvidence).toBe('newer than rename');
  await closeWorkspace(wa.id);
  expect((await service.crux.findById(wa.id)).meta?.backgroundEvidence).toBe('newer than rename');
});
it('leaving Growth cancels a pending historical projection without losing current files', async () => {
  const { wa, service, fa } = await pair();
  await wa.data.getState().createSnapshot({ silent: true });
  const id = wa.data.getState().growths[0]!.targetId;
  const gate = deferred();
  const find = service.crux.findById.bind(service.crux);
  vi.spyOn(service.crux, 'findById').mockImplementation(async (key) => {
    if (key === id) await gate.promise;
    return find(key);
  });
  const viewing = wa.data.getState().viewSnapshot(id, 0);
  await wa.data.getState().exitSnapshotView();
  gate.resolve();
  await viewing;
  expect(wa.data.getState().viewingSnapshotId).toBeNull();
  expect(wa.data.getState().artifacts.some((a) => a.id === fa.id)).toBe(true);
});

it('hidden token updates do not notify the switcher and disposed sessions have no live subscriptions', async () => {
  const { wa, wb } = await pair();
  await activateWorkspace(wb.id);
  wa.data.getState().setStreaming(true);
  const changed = vi.fn();
  const off = useWorkspaceRegistry.subscribe(changed);
  for (let i = 0; i < 100; i++) wa.data.getState().appendStreamContent('token ');
  expect(changed).not.toHaveBeenCalled();
  wa.data.getState().setStreaming(false);
  await closeWorkspace(wa.id);
  changed.mockClear();
  wa.data.getState().appendStreamContent('a stale callback');
  expect(changed).not.toHaveBeenCalled();
  expect(useWorkspaceRegistry.getState().entries.map((e) => e.id)).toEqual([wb.id]);
  off();
});

it('acknowledges a hidden completion when visited and shows each workspace queue count', async () => {
  const { wa, wb } = await pair();
  await activateWorkspace(wb.id);
  wa.data.setState({
    turnJob: { ...newTurnJob(wa.id, 'A task'), status: 'done' },
    turnQueue: ['next A'],
  });
  const summary = () => useWorkspaceRegistry.getState().entries.find((e) => e.id === wa.id)!.status;
  expect(summary()).toBe('Ready to review · 1 queued');
  await activateWorkspace(wa.id);
  expect(summary()).toBe('Queued · 1 queued');
  await activateWorkspace(wb.id);
  wa.data.setState({ turnQueue: [] });
  expect(summary()).toBe('Idle');
});

it('Tending rejects resolved and replacement approvals, including repeated requests for the same file', async () => {
  const { wa, wb, fa } = await pair();
  const first = wa.data.getState().requestDeleteApproval(fa.id, 'same.txt');
  const before = workspaceTending(wa);
  const target = { ...before, attentionId: before.attention[0]!.id };
  expect(validateTendingTarget(target)).toBe(wa);
  await activateWorkspace(wb.id);
  await activateWorkspace(wa.id);
  expect(validateTendingTarget(target)).toBe(wa);
  wa.data.getState().dismissDelete(fa.id);
  expect(await first).toBe(false);
  const second = wa.data.getState().requestDeleteApproval(fa.id, 'same.txt');
  expect(() => validateTendingTarget(target)).toThrow('This work changed');
  expect(workspaceTending(wa).attention[0]?.id).not.toBe(target.attentionId);
  wa.data.getState().dismissDelete(fa.id);
  await second;
});

it('a Stop confirmation from an earlier turn cannot stop a replacement run', async () => {
  const { wa } = await pair();
  wa.data.setState({ turnJob: newTurnJob(wa.id, 'First run') });
  const target = workspaceTending(wa);
  wa.data.setState({ turnJob: { ...newTurnJob(wa.id, 'Replacement run'), id: 'replacement' } });
  expect(() => stopTendingTarget(target)).toThrow('This work changed');
  expect(wa.data.getState().turnJob?.id).toBe('replacement');
});

it('opening an editor with Collaboration hidden does not acknowledge an unseen result or rewrite content', async () => {
  const { wa, wb } = await pair();
  await activateWorkspace(wb.id);
  wa.ui.getState().setPaneVisible('collaboration', false);
  wa.data.setState({ turnJob: { ...newTurnJob(wa.id, 'Result'), status: 'done' } });
  const content = wa.data.getState().crux;
  await activateWorkspace(wa.id);
  expect(workspaceTending(wa).attention.some((a) => a.kind === 'result')).toBe(true);
  wa.ui.getState().setPaneVisible('collaboration', true);
  expect(workspaceTending(wa).attention).toEqual([]);
  expect(wa.data.getState().crux).toBe(content);
});

it('requires an open workspace to close before its Crux can be deleted', async () => {
  const { wa, wb, service } = await pair();
  await expect(useGardenStore.getState().deleteCrux(wa.id)).rejects.toThrow(
    'Close this Crux workspace',
  );
  expect((await service.crux.findById(wa.id)).id).toBe(wa.id);
  await closeWorkspace(wa.id);
  await useGardenStore.getState().deleteCrux(wa.id);
  expect((await service.crux.listAll()).some((c) => c.id === wa.id)).toBe(false);
  expect(getWorkspace(wb.id)).toBe(wb);
});

it.each([false, true])(
  'retains messages arriving during capture with overlapping snapshots=%s',
  async (overlap) => {
    const { wa, service } = await pair();
    wa.data.getState().addMessage({ role: 'user', content: 'first' });
    const gate = deferred();
    const entered = deferred();
    const create = service.crux.create.bind(service.crux);
    let captures = 0;
    vi.spyOn(service.crux, 'create').mockImplementation(async (dto) => {
      if (dto.kind === 'snapshot' && ++captures === 1) {
        entered.resolve();
        await gate.promise;
      }
      return create(dto);
    });
    const first = wa.data.getState().createSnapshot({ silent: true });
    await entered.promise;
    wa.data.getState().addMessage({ role: 'user', content: 'arrived during capture' });
    const second = overlap ? wa.data.getState().createSnapshot({ silent: true }) : null;
    gate.resolve();
    await first;
    if (second) await second;
    else await wa.data.getState().createSnapshot({ silent: true });
    const snapshots = await Promise.all(
      wa.data.getState().growths.map((g) => service.crux.findById(g.targetId)),
    );
    const contents = snapshots.flatMap((s) => s.meta?.messages ?? []).map((m) => m.content);
    expect(contents).toEqual(['first', 'arrived during capture']);
    expect(wa.data.getState().messageSegmentStart).toBe(2);
  },
);
