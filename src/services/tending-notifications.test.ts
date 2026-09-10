import { expect, it } from 'vitest';
import { createAttentionDelivery } from './tending-notifications';
import { tendingState } from './tending-state';
import { newTurnJob } from './turn-jobs';
import type { TendingRow } from '@/stores/tendingStore';

it('delivers a transition once, distinguishes Tasks, and excludes prompt and tool details', () => {
  const next = createAttentionDelivery();
  const row: TendingRow = {
    id: 'a',
    cruxId: 'c',
    cruxTitle: 'Website',
    title: 'Checkout',
    phase: 'ready',
    model: 'example',
    state: tendingState({
      copyId: 'a',
      cruxId: 'c',
      lifetimeId: 'live',
      job: { ...newTurnJob('a', 'PRIVATE PROMPT'), status: 'done' },
      queued: 0,
    }),
  };
  const first = next([row]);
  expect(first).toHaveLength(1);
  expect(JSON.stringify(first)).not.toContain('PRIVATE PROMPT');
  expect(next([{ ...row }])).toEqual([]);
  expect(next([{ ...row, id: 'b', state: { ...row.state, copyId: 'b' } }])).toHaveLength(1);
  expect(next([{ ...row, state: { ...row.state, lifetimeId: null } }])).toEqual([]);
});
