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
  looksLikeCompletionClaim,
  shouldAutoCheck,
  beginCheck,
  finishCheck,
  continueJobForFix,
  newCheckJob,
  isJobActive,
  isFixingAfterCheck,
  describeCheck,
  verificationOf,
  finishJob,
  withLiveParallelState,
  hasPendingMerge,
  type TurnJob,
} from './turn-jobs';
import type { SubagentRun } from './subagents';

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

// ── Verify before done (B4) ─────────────────────────────────────────────────

describe('completion-claim heuristic', () => {
  it('matches the documented words and nothing else', () => {
    for (const t of [
      'Done — the landing page is ready.',
      'All finished.',
      'The build is complete',
      'This should now work in the preview.',
      'That should work.',
      "That's it!",
    ]) {
      expect(looksLikeCompletionClaim(t), t).toBe(true);
    }
    for (const t of ['Which colour do you prefer?', 'I read the file.', 'Here is the outline:']) {
      expect(looksLikeCompletionClaim(t), t).toBe(false);
    }
  });

  it('shouldAutoCheck needs: enabled, visual, mutated, done, unchecked, and a plan or a claim', () => {
    const done = finishJob(newTurnJob('c', 'Make a page'), 'done');
    const base = { job: done, content: 'Done.', mutated: true, visual: true, enabled: true };
    expect(shouldAutoCheck(base)).toBe(true);
    expect(shouldAutoCheck({ ...base, enabled: false })).toBe(false);
    expect(shouldAutoCheck({ ...base, visual: false })).toBe(false);
    expect(shouldAutoCheck({ ...base, mutated: false })).toBe(false);
    expect(shouldAutoCheck({ ...base, content: 'Here is a thought.' })).toBe(false);
    // A plan is a claim of intent to finish — no words needed
    const planned = { ...done, plan: { ...done.plan, explicit: true } };
    expect(shouldAutoCheck({ ...base, job: planned, content: 'Here is a thought.' })).toBe(true);
    // Never twice, never on a stopped job
    expect(shouldAutoCheck({ ...base, job: beginCheck(done, 'claim') })).toBe(false);
    expect(shouldAutoCheck({ ...base, job: finishJob(done, 'interrupted') })).toBe(false);
  });
});

describe('check state', () => {
  it('beginCheck → checking (active), finishCheck → done with the verdict and shot', () => {
    const job = finishJob(newTurnJob('c', 'Make a page'), 'done');
    const checking = beginCheck(job, 'claim');
    expect(checking.status).toBe('checking');
    expect(isJobActive(checking)).toBe(true);
    expect(checking.check).toMatchObject({ status: 'checking', attempt: 1, requestedBy: 'claim' });
    expect(describeCheck(checking.check!.status)).toBe('Checking…');

    const passed = finishCheck(checking, { ok: true, problems: [], shotFingerprint: 'f1' });
    expect(passed.status).toBe('done');
    expect(passed.check).toMatchObject({ status: 'passed', problems: [], attempt: 1 });
    expect(passed.check!.shots).toEqual([{ fingerprint: 'f1', ok: true }]);
    expect(summarizeJob(passed).check).toEqual({
      status: 'passed',
      problems: [],
      thumbnailFingerprint: 'f1',
    });
    expect(describeCheck('passed')).toBe('Checked ✓');
    expect(verificationOf(passed)).toMatchObject({
      status: 'passed',
      attempt: 1,
      requestedBy: 'claim',
    });
  });

  it('problems → one fix turn on the same job, then the re-check is attempt 2 and final', () => {
    const job = finishJob(newTurnJob('c', 'Make a page'), 'done');
    const first = finishCheck(beginCheck(job, 'claim'), {
      ok: false,
      problems: ['Heading missing'],
      shotFingerprint: 'before',
    });
    expect(first.check!.status).toBe('problems');
    expect(describeCheck('problems')).toBe('Check found problems');

    const fixing = continueJobForFix(first, ['Heading missing']);
    expect(fixing.id).toBe(job.id);
    expect(fixing.status).toBe('running');
    expect(fixing.endedAt).toBeUndefined();
    expect(fixing.plan.explicit).toBe(false);
    expect(fixing.plan.steps[0]!.title).toBe('Fix: Heading missing');
    expect(isFixingAfterCheck(fixing)).toBe(true);
    expect(isFixingAfterCheck(first)).toBe(false);

    const again = beginCheck(finishJob(fixing, 'done'), 'claim');
    expect(again.check!.attempt).toBe(2);
    expect(again.check!.shots).toEqual([{ fingerprint: 'before', ok: false }]);
    const final = finishCheck(again, { ok: true, problems: [], shotFingerprint: 'after' });
    expect(final.check!.shots.map((s) => s.fingerprint)).toEqual(['before', 'after']);
    expect(summarizeJob(final).check!.thumbnailFingerprint).toBe('after');
  });

  it('a manual check is a checking job the person asked for; a relaunch reports it interrupted', () => {
    const job = newCheckJob('c');
    expect(job.status).toBe('checking');
    expect(job.check).toMatchObject({ attempt: 1, requestedBy: 'person' });
    expect(job.prompt).toBe('Check it');
    expect(reconcilePersistedJob(job)!.status).toBe('interrupted');
  });

  it('a job without a check has no check summary and no verification', () => {
    const job = finishJob(newTurnJob('c', 'x'), 'done');
    expect(summarizeJob(job).check).toBeUndefined();
    expect(verificationOf(job)).toBeNull();
  });
});

describe('parallel work on the job (B5)', () => {
  const worker = (title: string, status: SubagentRun['status']): SubagentRun => ({
    title,
    status,
    scope: { paths: [`${title}.md`] },
    steps: 1,
    files: [],
  });

  it('a relaunch marks running and waiting workers interrupted along with the job', () => {
    const job: TurnJob = {
      ...newTurnJob('c', 'fan out'),
      status: 'running',
      subagents: [worker('a', 'done'), worker('b', 'running'), worker('c', 'pending')],
    };
    const fixed = reconcilePersistedJob(job)!;
    expect(fixed.status).toBe('interrupted');
    expect(fixed.subagents!.map((s) => s.status)).toEqual(['done', 'interrupted', 'interrupted']);
    expect(fixed.subagents![1]!.endedAt).toBeTruthy();
    // A finished job with settled workers is returned as is
    const settled = finishJob({ ...job, subagents: [worker('a', 'done')] }, 'done');
    expect(reconcilePersistedJob(settled)).toBe(settled);
  });

  it('a publish from the turn loop keeps the live subagent and merge state', () => {
    const base = newTurnJob('c', 'fan out');
    const live: TurnJob = {
      ...base,
      subagents: [worker('a', 'running')],
      merge: { baseId: 'b', status: 'pending', applied: [], conflicts: [] },
    };
    const fromLoop: TurnJob = { ...base, status: 'running' };
    const merged = withLiveParallelState(fromLoop, live);
    expect(merged.status).toBe('running');
    expect(merged.subagents).toBe(live.subagents);
    expect(merged.merge).toBe(live.merge);
    // A different job's live state never leaks in
    expect(withLiveParallelState(fromLoop, { ...live, id: 'other' })).toBe(fromLoop);
    expect(withLiveParallelState(fromLoop, null)).toBe(fromLoop);
  });

  it('hasPendingMerge is true only while conflicts await a decision', () => {
    const job = newTurnJob('c', 'x');
    expect(hasPendingMerge(job)).toBe(false);
    const conflict = { path: 'n.md', options: [{ branch: 0, kind: 'added' as const }] };
    expect(
      hasPendingMerge({ ...job, merge: { baseId: 'b', status: 'pending', applied: [], conflicts: [conflict] } }),
    ).toBe(true);
    expect(
      hasPendingMerge({ ...job, merge: { baseId: 'b', status: 'merged', applied: [], conflicts: [conflict] } }),
    ).toBe(false);
    expect(
      hasPendingMerge({ ...job, merge: { baseId: 'b', status: 'pending', applied: [], conflicts: [] } }),
    ).toBe(false);
  });
});
