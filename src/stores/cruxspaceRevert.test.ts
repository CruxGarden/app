import { localApiFixture } from '@/test/local-api-fixture';
import { beforeEach, expect, it } from 'vitest';
import { getServices, initServices } from '@/services';
import { createCruxspace } from '@/services/cruxspaces';
import { growthHostFor } from '@/services/growth';
import { createTask } from '@/services/tasks';
import { getCruxspaceMoment, setCruxspaceMoment } from '@/services/cruxspace-moment';
import { planCruxspaceRevert, revertCruxspaceTo } from './cruxspaceRevert';

localApiFixture();

beforeEach(() => initServices());

async function page(cruxId: string, html: string) {
  const { artifact } = getServices();
  const existing = (await artifact.findByResource('crux', cruxId)).find(
    (a) => a.meta?.path === 'index.html',
  );
  if (existing) await artifact.delete(existing);
  await artifact.create({ resourceId: cruxId, content: html, meta: { path: 'index.html' } });
}
async function read(cruxId: string) {
  const { artifact } = getServices();
  const file = (await artifact.findByResource('crux', cruxId)).find(
    (a) => a.meta?.path === 'index.html',
  )!;
  return artifact.readContent(file);
}

it('plans a revert per member, names blockers, and reverts every member with a safety checkpoint', async () => {
  const { crux } = getServices();
  const a = await crux.create({ title: 'Plan', type: 'workspace' });
  const b = await crux.create({ title: 'Site', type: 'workspace' });
  await page(a.id, 'plan v1');
  const ga = await growthHostFor(a.id);
  const first = await ga.snapshot({ label: 'Plan written', requestedBy: 'person' });
  await page(b.id, 'site v1');
  const gb = await growthHostFor(b.id);
  await gb.snapshot({ label: 'Site drafted', requestedBy: 'person' });
  await page(a.id, 'plan v2');
  await ga.snapshot({ label: 'Plan revised', requestedBy: 'person' });
  const late = await crux.create({ title: 'Late', type: 'workspace' });
  const space = await createCruxspace({
    name: 'Launch',
    brief: '',
    cruxIds: [a.id, b.id, late.id],
  });

  // The moment right after the first plan: Site and Late did not exist yet.
  let plan = await planCruxspaceRevert(space.id, first.when);
  expect(plan.blockers).toEqual([]);
  expect(plan.members.map((m) => [m.title, m.label]).sort()).toEqual(
    [
      ['Plan', 'Plan written'],
      ['Site', null],
      ['Late', null],
    ].sort(),
  );

  // An open Task blocks the whole revert by name.
  const task = await createTask(b.id, 'Polish');
  plan = await planCruxspaceRevert(space.id, first.when);
  expect(plan.blockers).toEqual(['Site: finish or abandon its open Task (Polish).']);
  await expect(revertCruxspaceTo(space.id, first.when)).rejects.toThrow(/Polish/);
  expect(await read(a.id)).toBe('plan v2');
  const { archiveTask } = await import('@/services/tasks');
  await archiveTask(task.id, true);

  setCruxspaceMoment({
    spaceId: space.id,
    spaceName: 'Launch',
    milestoneId: first.id,
    title: 'Plan written',
    at: first.when,
    step: 1,
    steps: 3,
  });
  const { listEditHistory, inspectEditCheckpoint } = await import('@/services/edit-history');
  const priorCheckpoints = new Set(
    (await listEditHistory(a.id)).checkpoints.map((checkpoint) => checkpoint.id),
  );
  const report = await revertCruxspaceTo(space.id, first.when);
  expect(report.reverted).toEqual(['Plan']);
  expect(report.skipped.sort()).toEqual(['Late', 'Site']);
  expect(await read(a.id)).toBe('plan v1');
  expect(await read(b.id)).toBe('site v1');
  expect((await ga.list()).map((g) => g.label)).toEqual(['Plan written', 'Plan revised']);
  const safety = (await listEditHistory(a.id)).checkpoints.find(
    (c) => c.reason === 'safety' && !priorCheckpoints.has(c.id),
  );
  expect(safety).toBeDefined();
  const retained = await inspectEditCheckpoint(a.id, safety!.id);
  const { hashContent } = await import('@/services/sqlite/helpers');
  expect(retained.files.find((f) => f.path === 'index.html')?.fingerprint).toBe(
    await hashContent('plan v2'),
  );
  expect(getCruxspaceMoment()).toBeNull();
});
