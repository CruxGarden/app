/**
 * The delete-approval contract between the AI tool loop and the UI.
 *
 * Every one of these is a "the conversation hangs forever" bug if it
 * regresses: the tool call awaits the user's answer, so any path that clears
 * the banner without settling the promise leaves the SDK step — and the whole
 * turn — permanently unfinished.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCruxStore, cancelPendingDeletes } from './cruxStore';
import { initServices, getServices } from '@/services';

async function seedCrux() {
  await initServices('local');
  const { crux } = getServices();
  const created = await crux.create({ title: 'Delete Test' });
  useCruxStore.setState({ crux: created, artifacts: [], pendingDeletes: [] });
  return created;
}

describe('delete approval lifecycle', () => {
  beforeEach(async () => {
    cancelPendingDeletes();
    await seedCrux();
  });

  it('resolves true after the app performs the deletion', async () => {
    const store = useCruxStore.getState();
    const pending = store.requestDeleteApproval('art-1', 'a.txt');
    expect(useCruxStore.getState().pendingDeletes).toHaveLength(1);

    await useCruxStore.getState().confirmDelete('art-1');
    await expect(pending).resolves.toBe(true);
    expect(useCruxStore.getState().pendingDeletes).toHaveLength(0);
  });

  it('resolves false when the user keeps the file', async () => {
    const pending = useCruxStore.getState().requestDeleteApproval('art-2', 'b.txt');
    useCruxStore.getState().dismissDelete('art-2');
    await expect(pending).resolves.toBe(false);
    expect(useCruxStore.getState().pendingDeletes).toHaveLength(0);
  });

  it('settles BOTH waiters when the model requests the same delete twice', async () => {
    // The SDK runs a step's tool calls concurrently; overwriting the resolver
    // orphaned the first promise and hung the turn.
    const store = useCruxStore.getState();
    const first = store.requestDeleteApproval('art-3', 'c.txt');
    const second = store.requestDeleteApproval('art-3', 'c.txt');

    // Only one banner for one file
    expect(useCruxStore.getState().pendingDeletes).toHaveLength(1);

    useCruxStore.getState().dismissDelete('art-3');
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });

  it('answers every waiter when the workspace is torn down', async () => {
    const store = useCruxStore.getState();
    const a = store.requestDeleteApproval('art-4', 'd.txt');
    const b = store.requestDeleteApproval('art-5', 'e.txt');

    store.reset();

    await expect(Promise.all([a, b])).resolves.toEqual([false, false]);
    expect(useCruxStore.getState().pendingDeletes).toHaveLength(0);
  });

  it('never strands the tool call when the deletion itself fails', async () => {
    const { artifact } = getServices();
    const spy = vi.spyOn(artifact, 'delete').mockRejectedValueOnce(new Error('disk gone'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const pending = useCruxStore.getState().requestDeleteApproval('art-6', 'f.txt');
    await useCruxStore.getState().confirmDelete('art-6');

    await expect(pending).resolves.toBe(false);
    expect(useCruxStore.getState().pendingDeletes).toHaveLength(0);

    spy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('cancelPendingDeletes is safe with nothing pending', () => {
    expect(() => cancelPendingDeletes()).not.toThrow();
  });
});
