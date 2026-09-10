import { describe, expect, it } from 'vitest';
import {
  attentionCount,
  targetMatches,
  tendingLabel,
  tendingState,
  type TendingInput,
} from './tending-state';
import { newTurnJob } from './turn-jobs';
const job = {
  ...newTurnJob('task-a', 'Change the page', new Date('2026-09-10T00:00:00Z')),
  status: 'done' as const,
};
const input: TendingInput = {
  copyId: 'task-a',
  cruxId: 'crux',
  lifetimeId: 'life-a',
  phase: 'ready',
  job,
  queued: 0,
};
const request = {
  id: 'request-a',
  requestedAt: '2026-09-10T00:00:01Z',
  reason: 'Needs permission',
};

describe('Tending observations', () => {
  it('waits for capture and checks to settle before announcing a result', () => {
    const state = tendingState({ ...input, settling: true });
    expect(state.activity).toBe('working');
    expect(state.attention).toEqual([]);
  });
  it('counts a Task once even with simultaneous permission and result attention', () => {
    const state = tendingState({ ...input, requests: [request, { ...request, id: 'request-b' }] });
    expect(state.attention.map((a) => a.kind)).toEqual(['permission', 'permission', 'result']);
    expect(attentionCount([state, state, tendingState({ ...input, copyId: 'main' })])).toBe(2);
    expect(state.attention[0]?.since).toBe(request.requestedAt);
    expect(tendingLabel(state)).toBe('Needs approval');
  });
  it('acknowledging a result cannot acknowledge an unanswered request', () => {
    const state = tendingState({ ...input, requests: [request], seenTurnId: job.id });
    expect(state.attention.map((a) => a.kind)).toEqual(['permission']);
  });
  it('a completed result does not imply verification; checks identify a saved snapshot', () => {
    expect(tendingState(input).verification.status).toBe('not-checked');
    const check = {
      status: 'passed' as const,
      requestedBy: 'person' as const,
      attempt: 1,
      problems: [],
      shots: [],
    };
    expect(tendingState({ ...input, job: { ...job, check } }).verification.status).toBe(
      'not-checked',
    );
    expect(
      tendingState({
        ...input,
        job: { ...job, check: { ...check, snapshotId: 'saved-candidate' } },
      }).verification,
    ).toMatchObject({ status: 'passed', snapshotId: 'saved-candidate' });
  });
  it.each(['unknown', 'inferred'] as const)(
    '%s evidence never promotes idle to a verified result',
    (evidence) => {
      const state = tendingState({
        ...input,
        evidence,
        job: {
          ...job,
          check: {
            status: 'passed',
            requestedBy: 'claim',
            attempt: 1,
            problems: [],
            shots: [],
            snapshotId: 'saved',
          },
        },
      });
      expect(state.attention).toEqual([]);
      expect(state.verification.status).toBe('not-checked');
    },
  );
  it('does not present a saved running job as a live agent or start its queue', () => {
    const state = tendingState({
      ...input,
      lifetimeId: undefined,
      job: { ...job, status: 'running' },
      queued: 2,
    });
    expect(state.activity).toBe('interrupted');
    expect(state.canStop).toBe(false);
    expect(state.queued).toBe(2);
  });
  it('distinguishes a slot wait from active work, even while the streaming UI is on', () => {
    const state = tendingState({ ...input, streaming: true, job: { ...job, status: 'queued' } });
    expect(state.activity).toBe('queued');
    expect(state.canStop).toBe(true);
  });
  it.each(['failed', 'interrupted'] as const)('keeps %s work actionable', (status) => {
    const state = tendingState({ ...input, job: { ...job, status } });
    expect(state.activity).toBe(status);
    expect(state.attention[0]?.kind).toBe('failure');
    expect(state.canStop).toBe(false);
  });
  it('rejects stale request, run, copy, owner and runtime identities', () => {
    const state = tendingState({ ...input, requests: [request] });
    const target = { ...state, attentionId: state.attention[0]!.id };
    expect(targetMatches(target, state)).toBe(true);
    for (const patch of [
      { runId: 'new-run' },
      { copyId: 'task-b' },
      { cruxId: 'other' },
      { lifetimeId: 'replacement' },
      { attention: [] },
    ])
      expect(targetMatches(target, { ...state, ...patch })).toBe(false);
  });
});
