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

beforeEach(async () => {
  await initServices('local');
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
  useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
});
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'index.html' } });

describe('whole Crux Growth projection', () => {
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
          source: review.sourceHead,
          target: result.resultHead,
          kind: 'merge',
        }),
        expect.objectContaining({
          source: review.targetHead,
          target: result.resultHead,
          kind: 'history',
        }),
        expect.objectContaining({
          source: empty.baseSnapshotId,
          target: `copy:${empty.id}`,
          kind: 'copy',
        }),
      ]),
    );
    const ancestry = growthAncestry(graph, result.resultHead!);
    expect(ancestry.has(review.sourceHead)).toBe(true);
    expect(ancestry.has(review.targetHead)).toBe(true);
    expect(layoutGrowthGraph(graph).cyclic).toBe(false);
    expect(graph.warnings).toEqual([]);
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
