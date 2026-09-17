import { it, expect } from 'vitest';
import { createUIStore } from './uiStore';
it('removes only the stopped run approval and rejects a late answer', async () => {
  const store = createUIStore('crux');
  const controller = new AbortController();
  const stopped = store
    .getState()
    .requestAgentApproval(
      { agent: 'Codex', action: 'tool', cruxId: 'crux', tool: 'Bash' },
      controller.signal,
    );
  const kept = store
    .getState()
    .requestAgentApproval({ agent: 'External client', action: 'publish', cruxId: 'crux' });
  const [first, second] = store.getState().pendingAgentApprovals;
  controller.abort();
  await expect(stopped).resolves.toBe(false);
  expect(store.getState().pendingAgentApprovals.map((a) => a.id)).toEqual([second!.id]);
  store.getState().resolveAgentApproval(first!.id, true);
  expect(store.getState().pendingAgentApprovals).toHaveLength(1);
  store.getState().resolveAgentApproval(second!.id, false);
  await expect(kept).resolves.toBe(false);
});
