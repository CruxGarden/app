import { describe, it, expect } from 'vitest';
import { progressInput, progressFromCall, progressDisplay } from './task-progress';
import { runTurnJob, newTurnJob, reconcilePersistedJob, type TurnJob } from './turn-jobs';
import { runSubagents, newSubagentRun, type SubagentTask } from './subagents';
import type { ConversationEvent } from '@/ai/engine';

function report(
  percent: number | null,
  message = 'Making the garden',
  wrapped = false,
): ConversationEvent[] {
  const name = wrapped ? 'mcp__crux_garden__garden_call_tool' : 'report_progress';
  const input = wrapped
    ? { name: 'report_progress', input: { percent, message } }
    : { percent, message };
  return [
    { type: 'tool_start', id: `p-${percent}`, name, input },
    { type: 'tool_result', id: `p-${percent}`, name, result: 'Recorded' },
  ];
}
async function* events(items: ConversationEvent[]) {
  yield* items;
}

describe('agent-reported progress', () => {
  it('bounds reports and distinguishes unknown from zero', () => {
    for (const percent of [undefined, NaN, Infinity, -1, 101, '50'])
      expect(progressInput({ percent, message: 'Working' })).toBeNull();
    for (const message of ['', ' ', 'a'.repeat(161), 23])
      expect(progressInput({ percent: 1, message })).toBeNull();
    expect(progressInput({ percent: null, message: 'Investigating' })?.percent).toBeNull();
    expect(progressInput({ percent: 0, message: 'Starting' })?.percent).toBe(0);
    expect(
      progressFromCall({
        name: 'report_progress',
        id: 'x',
        input: { percent: 70, message: 'No' },
        result: 'Error: refused',
      }),
    ).toBeUndefined();
    expect(
      progressFromCall({
        name: 'write_file',
        id: 'x',
        input: { percent: 70, message: 'No' },
        result: 'OK',
      }),
    ).toBeUndefined();
  });
  it.each([false, true])(
    'persists honest revisions through the owning turn (hosted envelope: %s)',
    async (wrapped) => {
      const updates: TurnJob[] = [];
      const result = await runTurnJob(newTurnJob('task-a', 'Build a garden'), {
        run: () =>
          events([
            ...report(60, 'First pass', wrapped),
            ...report(30, 'Found more work', wrapped),
            ...report(null, 'Investigating', wrapped),
          ]),
        update: (job) => {
          updates.push(structuredClone(job));
        },
      });
      expect(updates.filter((j) => j.progress).map((j) => j.progress!.percent)).toEqual(
        expect.arrayContaining([60, 30, null]),
      );
      expect(result.job.cruxId).toBe('task-a');
      expect(result.job.progress?.message).toBe('Investigating');
      const interrupted = reconcilePersistedJob({ ...result.job, status: 'running' });
      expect(interrupted?.status).toBe('interrupted');
      expect(interrupted?.progress).toEqual(result.job.progress);
    },
  );
  it('does not convert an estimate into completion or a fake time-based percentage', () => {
    const report = { percent: 100, message: 'Finishing', reportedAt: '' };
    expect(progressDisplay('running')?.percent).toBeNull();
    expect(progressDisplay('running', report)).toMatchObject({ percent: 99, complete: false });
    expect(progressDisplay('interrupted', report)).toMatchObject({
      percent: 99,
      complete: false,
      running: false,
    });
    expect(progressDisplay('done', report)).toMatchObject({ percent: 100, complete: true });
  });
  it('keeps independent worker estimates on their own rows', async () => {
    const tasks: SubagentTask[] = ['Alpha', 'Beta'].map((title) => ({
      title,
      instructions: 'Work',
      scope: { paths: [] },
    }));
    const runs = await runSubagents(tasks, tasks.map(newSubagentRun), {
      converse: (_task, i) => events(report(i === 0 ? 20 : 80)),
      update: () => {},
    });
    expect(runs.map((r) => r.progress?.percent)).toEqual([20, 80]);
  });
});
