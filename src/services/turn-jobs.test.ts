import { describe, it, expect } from 'vitest';
import type { ConversationEvent } from '@/ai/engine';
import {
  parsePlan,
  hasOpenPlanFence,
  newTurnJob,
  runTurnJob,
  reconcilePersistedJob,
  describeJobSummary,
  summarizeJob,
  stepLabel,
  type TurnJob,
} from './turn-jobs';

const PLAN = '```plan\n1. Lay the foundation\n2. Raise the walls\n3) Put on the roof\n```\n';

async function* events(list: ConversationEvent[]): AsyncGenerator<ConversationEvent> {
  for (const e of list) yield e;
}

/** A mutating round: write_file then the step boundary. */
function writeRound(i: number, path = 'progress.txt'): ConversationEvent[] {
  return [
    { type: 'tool_start', name: 'write_file', id: `t${i}`, input: { path } },
    { type: 'tool_result', name: 'write_file', id: `t${i}`, result: `Wrote ${path}` },
    { type: 'step_end', index: i },
  ];
}

function harness() {
  const updates: TurnJob[] = [];
  const snapshots: string[] = [];
  let counter = 0;
  return {
    updates,
    snapshots,
    deps: {
      update: (j: TurnJob) => {
        updates.push(j);
      },
      snapshot: async (label: string) => {
        snapshots.push(label);
        return `snap-${++counter}`;
      },
    },
  };
}

describe('parsePlan', () => {
  it('reads numbered, bracketed and bulleted lines from a ```plan fence', () => {
    expect(parsePlan(`Here we go.\n${PLAN}Starting.`)).toEqual([
      'Lay the foundation',
      'Raise the walls',
      'Put on the roof',
    ]);
    expect(parsePlan('```plan\n- one\n* two\n• three\n```')).toEqual(['one', 'two', 'three']);
  });

  it('returns null without a fence, for an empty fence, and for other fences', () => {
    expect(parsePlan('no plan here')).toBeNull();
    expect(parsePlan('```plan\n\n```')).toBeNull();
    expect(parsePlan('```js\n1. not a plan\n```')).toBeNull();
  });

  it('waits while the fence is still open', () => {
    expect(hasOpenPlanFence('```plan\n1. one\n2. tw')).toBe(true);
    expect(hasOpenPlanFence(PLAN)).toBe(false);
    expect(hasOpenPlanFence('nothing')).toBe(false);
  });
});

describe('runTurnJob', () => {
  it('parses the plan, snapshots per mutating round, advances steps, finishes done', async () => {
    const h = harness();
    const job = newTurnJob('crux-1', 'Please plan three steps');
    const result = await runTurnJob(job, {
      ...h.deps,
      run: () =>
        events([
          { type: 'text', content: '```plan\n1. Lay the foundation\n' },
          { type: 'text', content: '2. Raise the walls\n3. Put on the roof\n```\n' },
          ...writeRound(0),
          ...writeRound(1),
          ...writeRound(2),
          { type: 'text', content: 'Done.' },
          { type: 'done', textContent: '', hadMutation: true },
        ]),
    });

    expect(result.job.status).toBe('done');
    expect(result.job.plan.explicit).toBe(true);
    expect(result.job.plan.steps.map((s) => s.status)).toEqual(['done', 'done', 'done']);
    expect(result.job.snapshotIds).toEqual(['snap-1', 'snap-2', 'snap-3']);
    expect(h.snapshots).toEqual([
      'Step 1: Lay the foundation',
      'Step 2: Raise the walls',
      'Step 3: Put on the roof',
    ]);
    // The last step's snapshot captured everything: no end-of-turn double-up.
    expect(result.uncapturedMutation).toBe(false);
    expect(result.content).toContain('Done.');
    expect(result.toolCalls).toHaveLength(3);
    expect(describeJobSummary(summarizeJob(result.job))).toBe('Ran 3 steps · 3 snapshots');

    // The plan was published as soon as the fence closed, with step 1 running
    const planned = h.updates.find((u) => u.plan.explicit)!;
    expect(planned.plan.steps.map((s) => s.status)).toEqual(['running', 'pending', 'pending']);
  });

  it('a turn without a plan is one implicit step and leaves the snapshot to the end-of-turn policy', async () => {
    const h = harness();
    const job = newTurnJob('crux-1', 'Please write hello');
    const result = await runTurnJob(job, {
      ...h.deps,
      run: () =>
        events([
          ...writeRound(0, 'hello.txt'),
          { type: 'text', content: 'Done — I wrote that file for you.' },
          { type: 'done', textContent: '', hadMutation: true },
        ]),
    });
    expect(result.job.status).toBe('done');
    expect(result.job.plan.explicit).toBe(false);
    expect(result.job.plan.steps).toHaveLength(1);
    expect(h.snapshots).toEqual([]); // exactly as before B3
    expect(result.uncapturedMutation).toBe(true); // the policy snapshots at the end
    expect(stepLabel(result.job, 0)).toBe('Please write hello');
  });

  it('a mutation after the last step snapshot is reported as uncaptured', async () => {
    const h = harness();
    const result = await runTurnJob(newTurnJob('c', 'three steps'), {
      ...h.deps,
      run: () =>
        events([
          { type: 'text', content: PLAN },
          ...writeRound(0),
          // a second write in the same final round, no step_end afterwards
          { type: 'tool_start', name: 'write_file', id: 'x', input: { path: 'b.txt' } },
          { type: 'tool_result', name: 'write_file', id: 'x', result: 'Wrote b.txt' },
          { type: 'done', textContent: '', hadMutation: true },
        ]),
    });
    expect(h.snapshots).toHaveLength(1);
    expect(result.uncapturedMutation).toBe(true);
  });

  it('read-only rounds and blocked edits do not snapshot or advance', async () => {
    const h = harness();
    const result = await runTurnJob(newTurnJob('c', 'three steps'), {
      ...h.deps,
      run: () =>
        events([
          { type: 'text', content: PLAN },
          { type: 'tool_start', name: 'read_file', id: 'r', input: { path: 'a' } },
          { type: 'tool_result', name: 'read_file', id: 'r', result: 'contents' },
          { type: 'step_end', index: 0 },
          { type: 'tool_start', name: 'write_file', id: 'w', input: { path: 'a' } },
          { type: 'tool_result', name: 'write_file', id: 'w', result: 'Error: nope' },
          { type: 'step_end', index: 1 },
          { type: 'done', textContent: '', hadMutation: false },
        ]),
    });
    expect(h.snapshots).toEqual([]);
    expect(result.job.currentStep).toBe(0);
    expect(result.uncapturedMutation).toBe(false);
    // Finishing marks the remaining steps done — the model said it was finished.
    expect(result.job.status).toBe('done');
  });

  it('Stop mid-step leaves the job interrupted with the last snapshot restorable', async () => {
    const h = harness();
    let stopped = false;
    async function* run(): AsyncGenerator<ConversationEvent> {
      yield { type: 'text', content: PLAN };
      for (const e of writeRound(0)) yield e;
      // The user hits Stop while the model thinks about step 2
      stopped = true;
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    const result = await runTurnJob(newTurnJob('c', 'three steps'), {
      ...h.deps,
      run,
      stopReason: () => (stopped ? 'stopped' : null),
      aborted: () => stopped,
    });
    expect(result.job.status).toBe('interrupted');
    expect(result.job.stopReason).toBe('stopped');
    expect(result.job.plan.steps.map((s) => s.status)).toEqual(['done', 'interrupted', 'pending']);
    expect(result.job.snapshotIds).toEqual(['snap-1']);
    expect(result.job.endedAt).toBeDefined();
    expect(describeJobSummary(summarizeJob(result.job))).toBe(
      'Stopped after 1 of 3 steps · 1 snapshot',
    );
  });

  it('an engine error fails the job', async () => {
    const h = harness();
    const result = await runTurnJob(newTurnJob('c', 'hi'), {
      ...h.deps,
      run: () => events([{ type: 'error', message: 'The AI service is temporarily overloaded.' }]),
    });
    expect(result.job.status).toBe('failed');
    expect(result.job.error).toMatch(/overloaded/);
    expect(result.content).toContain('Error:');
  });

  it("the model's own `snapshot` tool completes the step without a second snapshot", async () => {
    const h = harness();
    let latest: string | null = 'snap-old';
    async function* run(): AsyncGenerator<ConversationEvent> {
      yield { type: 'text', content: PLAN };
      yield { type: 'tool_start', name: 'write_file', id: 'w', input: { path: 'a' } };
      yield { type: 'tool_result', name: 'write_file', id: 'w', result: 'Wrote a' };
      yield { type: 'tool_start', name: 'snapshot', id: 's', input: { label: 'mine' } };
      latest = 'snap-model'; // the B0 tool took a snapshot; the store's growths advanced
      yield {
        type: 'tool_result',
        name: 'snapshot',
        id: 's',
        result: 'Snapshot taken (id: snap-model)',
      };
      yield { type: 'step_end', index: 0 };
      yield { type: 'done', textContent: '', hadMutation: true };
    }
    const result = await runTurnJob(newTurnJob('c', 'three steps'), {
      ...h.deps,
      latestSnapshotId: () => latest,
      run,
    });
    expect(h.snapshots).toEqual([]); // the model's snapshot counted, ours stayed away
    expect(result.job.snapshotIds).toEqual(['snap-model']);
    expect(result.job.plan.steps[0]!.status).toBe('done');
    expect(result.job.currentStep).toBe(1);
  });
});

describe('reconcilePersistedJob', () => {
  it('reports a job persisted as running as interrupted by the app closing', () => {
    const job = newTurnJob('c', 'three steps');
    job.status = 'running';
    job.snapshotIds = ['snap-1'];
    const fixed = reconcilePersistedJob(job)!;
    expect(fixed.status).toBe('interrupted');
    expect(fixed.stopReason).toBe('closed');
    expect(fixed.snapshotIds).toEqual(['snap-1']);
    expect(fixed.endedAt).toBeDefined();
  });

  it('leaves finished jobs and null alone', () => {
    const job = { ...newTurnJob('c', 'x'), status: 'done' as const };
    expect(reconcilePersistedJob(job)).toBe(job);
    expect(reconcilePersistedJob(null)).toBeNull();
  });
});
