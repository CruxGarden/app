import { afterEach, beforeEach, expect, it } from 'vitest';
import { getServices, initServices } from '@/services';
import { allWorkspaces, closeWorkspace, useWorkspaceRegistry } from '@/stores/workspaceRegistry';
import { listWorkingCopies } from '@/services/working-copies';
import { exportCrux, importCrux } from '@/services/crux-io';
import { prepareTaskReview, verifyTaskReview, applyTaskReview } from '@/services/tasks';
import { getSqliteClient } from '@/services/sqlite/client';
import { createTendingDemo } from './create';
import { checkout, accessibility } from './content';

beforeEach(async () => {
  await initServices('local');
});
afterEach(async () => {
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
  useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
});
async function read(id: string, path: string) {
  const s = getServices();
  const artifact = (await s.artifact.findByResource('crux', id)).find(
    (a) => a.meta?.path === path,
  )!;
  return s.artifact.readContent(artifact.id);
}
it('creates isolated, reviewable Tasks and a portable merge graph without starting an agent', async () => {
  const demo = await createTendingDemo();
  const copies = await listWorkingCopies(demo.cruxId);
  expect(copies.filter((c) => c.role === 'task').map((c) => [c.title, c.phase])).toEqual(
    expect.arrayContaining([
      ['Brand foundation', 'merged'],
      ['Checkout', 'ready'],
      ['Accessibility', 'ready'],
      ['Autumn campaign', 'ready'],
    ]),
  );
  expect(await read(demo.cruxId, 'checkout.js')).not.toBe(checkout);
  expect(await read(demo.resultIds[0]!, 'checkout.js')).toBe(checkout);
  expect(await read(demo.resultIds[1]!, 'accessibility.css')).toBe(accessibility);
  for (const w of allWorkspaces()) {
    expect(w.data.getState().isStreaming).toBe(false);
    expect(w.data.getState().turnQueue).toEqual([]);
    expect(w.ui.getState().pendingAgentApprovals).toEqual([]);
  }
  const output = await exportCrux({ cruxId: demo.cruxId });
  expect(output.failed).toEqual([]);
  const imported = await importCrux({ data: await output.blob.arrayBuffer(), mode: 'clone' });
  const restored = (await listWorkingCopies(imported.cruxId)).filter((c) => c.role === 'task');
  expect(restored).toHaveLength(4);
  expect(
    restored.every((c) => !c.meta.turnJob && !c.meta.turnQueue && c.cruxId === imported.cruxId),
  ).toBe(true);
  const merges = await getSqliteClient().all<{ meta: string }>(
    "SELECT meta FROM cruxes WHERE kind = 'snapshot'",
  );
  expect(merges.some((row) => JSON.parse(row.meta).merge?.sourceHead)).toBe(true);
  for (const title of ['Checkout', 'Accessibility']) {
    const task = restored.find((c) => c.title === title)!;
    const review = await prepareTaskReview(task.id);
    expect(review.conflicts).toEqual([]);
    await verifyTaskReview(review.id);
    await applyTaskReview(review.id);
  }
  expect(await read(imported.cruxId, 'checkout.js')).toBe(checkout);
  expect(await read(imported.cruxId, 'accessibility.css')).toBe(accessibility);
  expect(await read(demo.cruxId, 'checkout.js')).not.toBe(checkout);
});
