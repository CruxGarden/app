import { beforeEach, expect, it } from 'vitest';
import { getServices, initServices } from './index';
import { createCruxspace } from './cruxspaces';
import { saveCruxOutput, copyCruxspaceAsset } from './cruxspace-assets';
import { loadCruxspaceHistory } from './cruxspace-history';
import { snapshotIndexAt } from './cruxspace-moment';
import { growthHostFor } from './growth';
import type { Dimension } from '@/api/types';

const png = () =>
  new Blob(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPfkAAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    { type: 'image/png' },
  );

beforeEach(() => initServices('local'));

it('combines every member’s Growth into one graph with transfers as cross-Crux links and an ordered milestone list', async () => {
  const { crux, artifact } = getServices();
  const source = await crux.create({ title: 'Artwork', type: 'workspace' });
  const target = await crux.create({ title: 'Website', type: 'workspace' });
  await artifact.create({ resourceId: target.id, content: '<h1>Hi</h1>', meta: { path: 'index.html' } });
  const targetGrowth = await growthHostFor(target.id);
  await targetGrowth.snapshot({ label: 'Blank page', requestedBy: 'person' });
  const space = await createCruxspace({ name: 'Release', brief: 'Ship the cover.', cruxIds: [source.id, target.id] });
  const output = await saveCruxOutput(source.id, png(), 'Cover');
  await copyCruxspaceAsset({
    spaceId: space.id,
    outputId: output.id,
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/cover.png',
  });
  await targetGrowth.snapshot({ label: 'Cover placed', requestedBy: 'person' });
  await targetGrowth.snapshot({ label: 'Project saved', requestedBy: 'person' });

  const history = await loadCruxspaceHistory(space.id);
  expect(history.space.name).toBe('Release');
  expect(history.members.map((m) => [m.title, m.checkpoints, m.outputs.length, m.transfersIn, m.transfersOut])).toEqual([
    ['Artwork', 1, 1, 0, 1],
    ['Website', 4, 0, 1, 0],
  ]);
  expect(history.graph.lanes.map((l) => l.title)).toEqual(['Artwork', 'Website']);
  expect(history.laneOwners).toEqual({ [source.id]: source.id, [target.id]: target.id });
  const transfer = history.transfers[0]!;
  expect(transfer).toMatchObject({ sourceCruxId: source.id, targetCruxId: target.id, label: 'Cover', path: 'assets/cover.png' });
  const sourceNode = history.graph.nodes.find((n) => n.id === transfer.sourceNodeId)!;
  const targetNode = history.graph.nodes.find((n) => n.id === transfer.targetNodeId)!;
  expect(sourceNode.title).toBe('Output: Cover');
  expect(targetNode.title).toBe('Used Cover from Release');
  expect(history.graph.links).toContainEqual({
    source: sourceNode.id,
    target: targetNode.id,
    kind: 'transfer',
    skipped: 0,
    label: 'Cover → Website',
  });
  expect(history.milestones.map((m) => [m.kind, m.memberTitle, m.title])).toEqual([
    ['checkpoint', 'Website', 'Blank page'],
    ['checkpoint', 'Artwork', 'Output: Cover'],
    ['transfer', 'Website', 'Used Cover from Release'],
    ['checkpoint', 'Website', 'Cover placed'],
  ]);
  expect(history.milestones[2]!.transfer?.path).toBe('assets/cover.png');
  // Automatic saves stay out of the walk but remain reachable as checkpoints.
  expect(history.checkpoints.map((m) => m.title)).toEqual([
    'Blank page',
    'Output: Cover',
    'Used Cover from Release',
    'Cover placed',
    'Project saved',
  ]);
  // Milestones are strictly time-ordered so a walkthrough steps forward through them.
  const times = history.milestones.map((m) => m.created);
  expect([...times].sort()).toEqual(times);
});

it('reports members that are gone without failing the rest', async () => {
  const { crux } = getServices();
  const a = await crux.create({ title: 'A', type: 'workspace' });
  const b = await crux.create({ title: 'B', type: 'workspace' });
  const space = await createCruxspace({ name: 'Pair', brief: '', cruxIds: [a.id, b.id] });
  await crux.delete(b.id);
  const history = await loadCruxspaceHistory(space.id);
  expect(history.members.map((m) => [m.title, m.available])).toEqual([
    ['A', true],
    ['Unavailable Crux', false],
  ]);
  expect(history.graph.warnings).toContain('Some members are no longer in this Garden; their history is omitted.');
});

it('picks the last checkpoint at or before a moment', () => {
  const growths = ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z'].map(
    (created) => ({ created }) as Dimension,
  );
  expect(snapshotIndexAt(growths, '2025-12-31T00:00:00Z')).toBeNull();
  expect(snapshotIndexAt(growths, '2026-01-02T00:00:00Z')).toBe(1);
  expect(snapshotIndexAt(growths, '2026-01-02T12:00:00Z')).toBe(1);
  expect(snapshotIndexAt(growths, '2026-02-01T00:00:00Z')).toBe(2);
});
