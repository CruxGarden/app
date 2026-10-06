import { beforeEach, expect, it } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';

localApiFixture();
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

beforeEach(() => initServices());

it('keeps transfers distinct from deliberate versions and never classifies versions by their label', async () => {
  const { crux, artifact } = getServices();
  const source = await crux.create({ title: 'Artwork', type: 'workspace' });
  const target = await crux.create({ title: 'Website', type: 'workspace' });
  await artifact.create({
    resourceId: target.id,
    content: '<h1>Hi</h1>',
    meta: { path: 'index.html' },
  });
  const targetGrowth = await growthHostFor(target.id);
  await targetGrowth.snapshot({ label: 'Blank page', requestedBy: 'person' });
  const space = await createCruxspace({
    name: 'Release',
    brief: 'Ship the cover.',
    cruxIds: [source.id, target.id],
  });
  const output = await saveCruxOutput(source.id, png(), 'Cover');
  await copyCruxspaceAsset({
    spaceId: space.id,
    outputId: output.id,
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/cover.png',
  });
  const unmarked = await loadCruxspaceHistory(space.id);
  expect(unmarked.transfers[0]).toMatchObject({ sourceNodeId: null, targetNodeId: null });
  expect(unmarked.graph.links.some((link) => link.kind === 'transfer')).toBe(false);
  expect(unmarked.milestones.filter((m) => m.kind === 'transfer')).toHaveLength(1);
  await targetGrowth.snapshot({ label: 'Cover placed', requestedBy: 'person' });
  await targetGrowth.snapshot({ label: 'Project saved', requestedBy: 'person' });

  const history = await loadCruxspaceHistory(space.id);
  expect(history.space.name).toBe('Release');
  expect(
    [...history.members]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((m) => [m.title, m.checkpoints, m.outputs.length, m.transfersIn, m.transfersOut]),
  ).toEqual([
    ['Artwork', 0, 1, 0, 1],
    ['Website', 3, 0, 1, 0],
  ]);
  expect(history.graph.lanes.map((l) => l.title).sort()).toEqual(['Artwork', 'Website']);
  expect(history.laneOwners).toEqual({ [source.id]: source.id, [target.id]: target.id });
  const transfer = history.transfers[0]!;
  expect(transfer).toMatchObject({
    sourceCruxId: source.id,
    targetCruxId: target.id,
    label: 'Cover',
    path: 'assets/cover.png',
  });
  expect(transfer.sourceNodeId).toBeNull();
  expect(history.graph.nodes.find((n) => n.id === transfer.targetNodeId)?.title).toBe(
    'Cover placed',
  );
  expect(history.graph.links.some((link) => link.kind === 'transfer')).toBe(false);
  expect(history.milestones.map((m) => [m.kind, m.memberTitle, m.title])).toEqual([
    ['checkpoint', 'Website', 'Blank page'],
    ['transfer', 'Website', 'Cover from Artwork → assets/cover.png'],
    ['checkpoint', 'Website', 'Cover placed'],
    ['checkpoint', 'Website', 'Project saved'],
  ]);
  expect(history.milestones[1]!.transfer?.path).toBe('assets/cover.png');
  expect(history.checkpoints).toEqual(history.milestones);
  // Milestones are strictly time-ordered so a walkthrough steps forward through them.
  const times = history.milestones.map((m) => m.created);
  expect([...times].sort()).toEqual(times);
});

it('omits purged members while preserving the remaining native Garden history', async () => {
  const { crux } = getServices();
  const a = await crux.create({ title: 'A', type: 'workspace' });
  const b = await crux.create({ title: 'B', type: 'workspace' });
  const space = await createCruxspace({ name: 'Pair', brief: '', cruxIds: [a.id, b.id] });
  await crux.delete(b.id);
  const history = await loadCruxspaceHistory(space.id);
  expect(history.members.map((m) => [m.title, m.available])).toEqual([['A', true]]);
  expect(history.graph.lanes.map((lane) => lane.id)).toEqual([a.id]);
  expect(history.graph.warnings).toEqual([]);
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

it('connects transfers only to marked versions that actually retain their output and provenance', async () => {
  const { crux, artifact } = getServices();
  const source = await crux.create({ title: 'Art', type: 'workspace' });
  const target = await crux.create({ title: 'Site', type: 'workspace' });
  const sourceGrowth = await growthHostFor(source.id);
  const targetGrowth = await growthHostFor(target.id);
  const space = await createCruxspace({
    name: 'Release',
    brief: '',
    cruxIds: [source.id, target.id],
  });
  await sourceGrowth.snapshot({ label: 'Output: Cover', requestedBy: 'person' });
  const output = await saveCruxOutput(source.id, png(), 'Cover');
  const sourceVersion = await sourceGrowth.snapshot({
    label: 'Master artwork',
    requestedBy: 'person',
  });
  const transfer = await copyCruxspaceAsset({
    spaceId: space.id,
    outputId: output.id,
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/cover.png',
  });
  const targetVersion = await targetGrowth.snapshot({ label: 'Demo', requestedBy: 'person' });
  const history = await loadCruxspaceHistory(space.id);
  expect(history.transfers[0]).toMatchObject({
    sourceNodeId: sourceVersion.id,
    targetNodeId: targetVersion.id,
  });
  expect(history.graph.links).toContainEqual({
    source: sourceVersion.id,
    target: targetVersion.id,
    kind: 'transfer',
    skipped: 0,
    label: 'Cover → Site',
  });
  // A timestamp and matching title are not evidence of content in a marked version.
  const sidecar = (await artifact.findByResource('crux', target.id)).find(
    (f) => f.meta?.path === transfer.provenancePath,
  )!;
  await artifact.delete(sidecar);
  await targetGrowth.snapshot({ label: 'Used Cover from Release', requestedBy: 'person' });
  expect((await loadCruxspaceHistory(space.id)).transfers).toHaveLength(0);
});
