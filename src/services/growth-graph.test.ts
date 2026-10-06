import { taskHistoryNodeId } from './task-history-graph';
import { loadGrowthDetail } from './growth-detail';
import { readCheckpointFile } from './checkpoint-files';
import { localApiFixture } from '@/test/local-api-fixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import {
  allWorkspaces,
  closeWorkspace,
  openWorkspace,
  useWorkspaceRegistry,
} from '@/stores/workspaceRegistry';
import {
  archiveTask,
  createTask,
  prepareTaskReview,
  verifyTaskReview,
  applyTaskReview,
} from './tasks';
import { exportCrux, importCrux } from './crux-io';
import {
  loadGrowthGraph,
  buildGrowthGraph,
  compactGrowthGraph,
  layoutGrowthGraph,
  growthAncestry,
  type GrowthNode,
  type GrowthLane,
} from './growth-graph';

const native = localApiFixture({ project: true });

beforeEach(async () => {
  await initServices();
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
  useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
});
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'index.html' } });

describe('whole Crux Growth projection', () => {
  it('refuses incomplete history authority before reading a partial graph and permits retry', async () => {
    const main = await getServices().crux.create({ title: 'Retain all history' });
    await write(main.id, 'Base');
    const copy = await createTask(main.id, 'Task');
    const db = getSqliteClient();
    const inspect = db.inspectTaskHistory;
    const reads = vi.spyOn(db, 'all');
    const before = await db.export();
    db.inspectTaskHistory = undefined;
    try {
      await expect(loadGrowthGraph(main.id)).rejects.toThrow('Growth storage is unavailable');
      expect(reads).not.toHaveBeenCalled();
      expect(await db.export()).toEqual(before);
    } finally {
      db.inspectTaskHistory = inspect;
    }
    const graph = await loadGrowthGraph(main.id);
    expect(graph.lanes.map((lane) => lane.id)).toContain(copy.id);
    expect(graph.nodes.map((node) => node.id)).toContain(taskHistoryNodeId(copy.id, 'base'));
  });

  it('propagates an actual history metadata read failure without substituting a partial graph', async () => {
    const main = await getServices().crux.create({ title: 'Unavailable history' });
    await write(main.id, 'Keep bytes');
    const copy = await createTask(main.id, 'Keep Task');
    const indexes = await native().client.all<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'task_merges' AND sql IS NOT NULL",
    );
    await native().faultSql('ALTER TABLE task_merges RENAME TO temporarily_unavailable_merges');
    try {
      await expect(loadGrowthGraph(main.id)).rejects.toThrow(/no such table/i);
    } finally {
      await native().faultSql('ALTER TABLE temporarily_unavailable_merges RENAME TO task_merges');
      // SQLite rewrites index SQL during table renames. Restore the exact owner
      // schema after this deliberate fault, so restart tests ordinary admission.
      for (const index of indexes) {
        await native().faultSql(`DROP INDEX ${index.name}`);
        await native().faultSql(index.sql);
      }
    }
    await native().restart();
    expect((await loadGrowthGraph(main.id)).lanes.map((lane) => lane.id)).toContain(copy.id);
    const file = (await getServices().artifact.findByResource('crux', copy.id)).find(
      (file) => file.meta?.path === 'index.html',
    );
    expect(await getServices().artifact.readContent(file!)).toBe('Keep bytes');
  });

  it('shows both sides of a completed merge, archived work and empty Tasks without loading blobs or transcripts', async () => {
    const main = await getServices().crux.create({ title: 'Garden website' });
    await write(main.id, 'Base');
    const a = await createTask(main.id, 'Checkout');
    const b = await createTask(main.id, 'Experiment');
    const empty = await createTask(main.id, 'Next idea');
    await write(a.id, 'Checkout complete');
    (await openWorkspace(a.id)).data
      .getState()
      .addMessage({ role: 'user', content: 'Private transcript sentinel' });
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const result = await applyTaskReview(review.id);
    await write(b.id, 'Experiment preserved');
    await archiveTask(b.id, true);
    const other = await getServices().crux.create({ title: 'Unrelated project' });
    await createTask(other.id, 'Not this graph');
    const blobs = vi.spyOn(getSqliteClient(), 'blobRead');
    const graph = await loadGrowthGraph(main.id);
    expect(blobs).not.toHaveBeenCalled();
    expect(JSON.stringify(graph)).not.toContain('Private transcript sentinel');
    expect(graph.lanes.map((l) => l.title)).toEqual([
      'Main',
      'Checkout',
      'Experiment',
      'Next idea',
    ]);
    expect(graph.lanes.find((l) => l.id === a.id)?.phase).toBe('merged');
    expect(graph.lanes.find((l) => l.id === b.id)?.phase).toBe('archived');
    expect(graph.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: taskHistoryNodeId(review.id, 'source'),
          target: taskHistoryNodeId(result.id, 'result'),
          kind: 'merge',
        }),
        expect.objectContaining({
          source: taskHistoryNodeId(review.id, 'target'),
          target: taskHistoryNodeId(result.id, 'result'),
          kind: 'history',
        }),
        expect.objectContaining({
          source: taskHistoryNodeId(empty.id, 'base'),
          target: `copy:${empty.id}`,
          kind: 'copy',
        }),
      ]),
    );
    const ancestry = growthAncestry(graph, taskHistoryNodeId(result.id, 'result'));
    expect(ancestry.has(taskHistoryNodeId(review.id, 'source'))).toBe(true);
    expect(ancestry.has(taskHistoryNodeId(review.id, 'target'))).toBe(true);
    expect(layoutGrowthGraph(graph).cyclic).toBe(false);
    expect(graph.warnings).toEqual([]);
    const resultNode = graph.nodes.find((n) => n.id === taskHistoryNodeId(result.id, 'result'))!;
    const detail = await loadGrowthDetail(resultNode);
    expect(detail.messages.some((m) => m.content.includes('Private transcript sentinel'))).toBe(
      true,
    );
    expect(
      await (
        await readCheckpointFile(detail.artifacts.find((f) => f.path === 'index.html')!)
      ).text(),
    ).toBe('Checkout complete');
    await write(main.id, 'Later Main');
    expect(
      await (
        await readCheckpointFile(detail.artifacts.find((f) => f.path === 'index.html')!)
      ).text(),
    ).toBe('Checkout complete');
  });

  it('connects later Tasks and marked versions to retained merges and preserves those links after restart', async () => {
    const main = await getServices().crux.create({ title: 'Connected history' });
    await write(main.id, 'Starting point');
    const task = await createTask(main.id, 'First contribution');
    await write(task.id, 'Accepted contribution');
    const review = await prepareTaskReview(task.id);
    await verifyTaskReview(review.id);
    await applyTaskReview(review.id);
    const later = await createTask(main.id, 'Next contribution');
    const resultId = taskHistoryNodeId(review.id, 'result');
    const workspace = await openWorkspace(main.id);
    await workspace.data
      .getState()
      .createSnapshot({ label: 'An explicit marked version', silent: true });
    const snapshotId = workspace.data.getState().growths.at(-1)!.targetId;
    const graph = await loadGrowthGraph(main.id);
    expect(graph.nodes.find((n) => n.id === taskHistoryNodeId(later.id, 'base'))?.parentId).toBe(
      resultId,
    );
    expect(graph.nodes.find((n) => n.id === snapshotId)?.parentId).toBe(resultId);
    expect(growthAncestry(graph, snapshotId).has(taskHistoryNodeId(task.id, 'base'))).toBe(true);
    expect(layoutGrowthGraph(graph).cyclic).toBe(false);
    expect(graph.warnings).toEqual([]);
    for (const w of allWorkspaces())
      await closeWorkspace(w.id, { stop: true, documents: 'discard' });
    await native().restart();
    expect(await loadGrowthGraph(main.id)).toEqual(graph);
  });

  it('reconstructs the graph from a portable .crux clone with all identities remapped', async () => {
    const main = await getServices().crux.create({ title: 'Portable history' });
    await write(main.id, 'Base');
    const a = await createTask(main.id, 'Merged work');
    const b = await createTask(main.id, 'Private experiment');
    await write(a.id, 'Result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    await applyTaskReview(review.id);
    await archiveTask(b.id, true);
    const archive = await exportCrux({ cruxId: main.id });
    const before = await loadGrowthGraph(main.id);
    const cloned = await importCrux({ data: archive.blob, mode: 'clone' });
    const after = await loadGrowthGraph(cloned.cruxId);
    expect(after.lanes.map(({ title, phase }) => ({ title, phase }))).toEqual(
      before.lanes.map(({ title, phase }) => ({ title, phase })),
    );
    expect(after.nodes).toHaveLength(before.nodes.length);
    expect(after.links).toHaveLength(before.links.length);
    expect(after.links.filter((l) => l.kind === 'merge')).toHaveLength(1);
    expect(after.nodes.every((n) => !before.nodes.some((old) => old.id === n.id))).toBe(true);
    expect(after.warnings).toEqual([]);
    const detail = await loadGrowthDetail(after.nodes.find((n) => n.kind === 'merge')!);
    expect(
      await (
        await readCheckpointFile(detail.artifacts.find((f) => f.path === 'index.html')!)
      ).text(),
    ).toBe('Result');
  });
});

const lane = (id: string): GrowthLane => ({
  id,
  title: id,
  phase: id === 'main' ? 'main' : 'merged',
  baseId: id === 'main' ? null : 'base',
  headId: null,
});
const snapshot = (
  id: string,
  ownerId: string,
  parentId: string | null,
  mergeSourceId: string | null = null,
): GrowthNode => ({
  id,
  ownerId,
  parentId,
  mergeSourceId,
  mergeTargetId: null,
  kind: 'snapshot',
  title: id,
  created: '',
});
describe('graph presentation preserves history', () => {
  it('compacts linear interiors while preserving task origins, merges, head references and selected checkpoints', () => {
    const graph = buildGrowthGraph(
      'main',
      'Test',
      [lane('main'), lane('task')],
      [
        snapshot('base', 'main', null),
        snapshot('a', 'task', 'base'),
        snapshot('b', 'task', 'a'),
        snapshot('c', 'task', 'b'),
        snapshot('d', 'task', 'c'),
        snapshot('main2', 'main', 'base'),
        snapshot('merge', 'main', 'main2', 'd'),
      ],
    );
    const compact = compactGrowthGraph(graph, new Set());
    expect(compact.nodes.map((n) => n.id)).not.toContain('b');
    expect(compact.links).toContainEqual({ source: 'a', target: 'd', kind: 'history', skipped: 2 });
    expect(compact.links).toContainEqual({
      source: 'd',
      target: 'merge',
      kind: 'merge',
      skipped: 0,
    });
    expect(compactGrowthGraph(graph, new Set(), 'b').nodes.some((n) => n.id === 'b')).toBe(true);
    expect(compactGrowthGraph(graph, new Set(['main', 'task'])).nodes).toEqual(graph.nodes);
    expect(growthAncestry(graph, 'merge')).toEqual(
      new Set(['merge', 'main2', 'd', 'base', 'c', 'b', 'a']),
    );
    const layout = layoutGrowthGraph(graph);
    layout.nodes[0]!.x = 900;
    expect(graph.nodes[0]).not.toHaveProperty('x');
  });
  it('handles dangling references and cycles without fetching unrelated history or hanging', () => {
    const graph = buildGrowthGraph(
      'main',
      'Old history',
      [lane('main')],
      [
        snapshot('a', 'main', 'b'),
        snapshot('b', 'main', 'a'),
        snapshot('orphan', 'main', 'missing'),
        snapshot('unrelated', 'other', null),
      ],
    );
    expect(graph.nodes.some((n) => n.id === 'unrelated')).toBe(false);
    expect(graph.warnings).toHaveLength(1);
    expect(layoutGrowthGraph(graph).cyclic).toBe(true);
    expect(growthAncestry(graph, 'a')).toEqual(new Set(['a', 'b']));
  });
  it('separates independent states in one lane and keeps their descendants below them', () => {
    const graph = buildGrowthGraph(
      'main',
      'Separate histories',
      [lane('main')],
      [
        { ...snapshot('first', 'main', null), created: '2026-10-01T01:00:00Z' },
        { ...snapshot('second', 'main', null), created: '2026-10-01T00:00:00Z' },
        snapshot('child', 'main', 'first'),
      ],
    );
    const positions = layoutGrowthGraph(graph).nodes;
    expect(new Set(positions.map((node) => node.y)).size).toBe(positions.length);
    expect(new Set(positions.map((node) => node.x)).size).toBe(1);
    expect(positions.find((node) => node.id === 'first')!.y).toBeGreaterThan(
      positions.find((node) => node.id === 'second')!.y,
    );
    for (const link of graph.links)
      expect(positions.find((node) => node.id === link.target)!.y).toBeGreaterThan(
        positions.find((node) => node.id === link.source)!.y,
      );
  });
  it('uses graph order rather than timestamps to place parents before children', () => {
    const graph = buildGrowthGraph(
      'main',
      'Imported',
      [lane('main')],
      [snapshot('child', 'main', 'parent'), snapshot('parent', 'main', null)],
    );
    const layout = layoutGrowthGraph(graph);
    expect(layout.nodes.find((n) => n.id === 'child')!.y).toBeGreaterThan(
      layout.nodes.find((n) => n.id === 'parent')!.y,
    );
  });
});

it('keeps an explicitly empty restored branch separate from existing marked versions and advances after marking', async () => {
  const { crux } = getServices();
  const created = await crux.create({ title: 'Independent directions' });
  const workspace = await openWorkspace(created.id);
  workspace.data.setState({
    messages: [{ role: 'user', content: 'Old direction', timestamp: new Date().toISOString() }],
  });
  await workspace.data.getState().createSnapshot({ label: 'Old direction' });
  workspace.data.getState().patchCruxMeta({ settings: { activeBranch: null } });
  workspace.data.setState({
    messages: [{ role: 'user', content: 'New direction', timestamp: new Date().toISOString() }],
    messageSegmentStart: 0,
  });
  await workspace.data.getState().saveMeta();
  await workspace.data.getState().loadCrux(created.id);
  expect(workspace.data.getState().messages.map((m) => m.content)).toEqual(['New direction']);
  const empty = await loadGrowthGraph(created.id);
  expect(empty.nodes.find((n) => n.kind === 'copy')?.parentId).toBeNull();
  expect(empty.links.some((link) => link.kind === 'copy')).toBe(false);
  await workspace.data.getState().createSnapshot({ label: 'New root' });
  const tip = workspace.data.getState().growths.at(-1)!.targetId;
  expect((await crux.findById(tip)).meta?.parentCruxId).toBeNull();
  expect(workspace.data.getState().crux?.meta?.settings?.activeBranch).toBe(tip);
  await workspace.data.getState().loadCrux(created.id);
  expect(workspace.data.getState().messages.map((m) => m.content)).toEqual(['New direction']);
});
