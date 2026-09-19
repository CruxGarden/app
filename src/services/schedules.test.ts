import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCHEDULES_KEY,
  addSchedule,
  initSchedules,
  nextDue,
  onEvent,
  removeSchedule,
  setScheduleEnabled,
  setScheduledCruxSource,
  tickSchedules,
  useSchedules,
  describeTrigger,
} from './schedules';
import { setActionRuntime } from './schedule-actions';
import { ALERTS_KEY, initAlerts, openAlerts, useAlerts } from './alerts';
import { setSetting, getSetting } from './settings';

const T0 = new Date('2026-09-19T09:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;
const DAY = 86_400_000;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('schedules (GARDEN-SCHEDULER-PLAN)', () => {
  const played: number[] = [];
  const notified: string[] = [];
  const prompts: string[] = [];
  const tools: string[] = [];
  beforeEach(() => {
    setSetting(SCHEDULES_KEY, '[]');
    setSetting(ALERTS_KEY, '[]');
    initSchedules();
    initAlerts();
    played.length = notified.length = prompts.length = tools.length = 0;
    setActionRuntime({
      playCue: async (_p, times) => void played.push(times),
      notify: (title) => void notified.push(title),
      prompt: async (cruxId, prompt) => void prompts.push(`${cruxId}:${prompt}`),
      tool: async (cruxId, tool) => {
        tools.push(`${cruxId}:${tool}`);
        if (tool === 'explode') throw new Error('boom');
        return 'Wrote NOTES.md';
      },
      cruxTitle: (id) => ({ c1: 'Lantern', c2: 'Tide charts' })[id] ?? id,
    });
    setScheduledCruxSource(() => [
      { id: 'c1', title: 'Lantern', updated: at(-3 * DAY).toISOString() },
      { id: 'c2', title: 'Tide charts', updated: at(-2 * MIN).toISOString() },
    ]);
  });

  it('a one-off fires once when due, then switches itself off; missed says so', async () => {
    addSchedule(
      {
        title: 'Water the ferns',
        trigger: { kind: 'at', when: at(10 * MIN).toISOString() },
        actions: [
          { kind: 'alert', body: 'Both pots.' },
          { kind: 'cue', cue: 'ping', times: 2 },
        ],
      },
      at(0),
    );
    expect(tickSchedules(at(9 * MIN))).toEqual([]);
    const fired = tickSchedules(at(11 * MIN));
    expect(fired.map((f) => f.title)).toEqual(['Water the ferns']);
    expect(fired[0]!.missed).toBe(false);
    await flush();
    expect(openAlerts(undefined, at(11 * MIN))[0]!.body).toMatch(/^Both pots\./);
    expect(played).toEqual([2]);
    expect(tickSchedules(at(12 * MIN))).toEqual([]);
    expect(useSchedules.getState().schedules[0]!.enabled).toBe(false);

    addSchedule(
      {
        title: 'Post the update',
        trigger: { kind: 'at', when: at(0).toISOString() },
        actions: [{ kind: 'notify' }, { kind: 'alert' }],
      },
      at(2 * 60 * MIN),
    );
    await flush();
    const missed = openAlerts(undefined, at(2 * 60 * MIN)).find(
      (a) => a.title === 'Post the update',
    )!;
    expect(missed.body).toMatch(/while the app was closed/);
    expect(notified).toEqual(['Post the update']);
  });

  it('every and cron repeat from now, and a disabled repeat restarts from now', () => {
    const every = addSchedule(
      { title: 'Stretch', trigger: { kind: 'every', minutes: 20 }, actions: [{ kind: 'alert' }] },
      at(0),
    );
    expect(every.next).toBe(at(20 * MIN).toISOString());
    expect(tickSchedules(at(19 * MIN))).toEqual([]);
    expect(tickSchedules(at(21 * MIN))).toHaveLength(1);
    expect(useSchedules.getState().schedules[0]!.next).toBe(at(40 * MIN).toISOString());

    const cron = addSchedule(
      {
        title: 'Nine sharp',
        trigger: { kind: 'cron', expr: '0 * * * *' },
        actions: [{ kind: 'alert' }],
      },
      at(0),
    );
    // every hour on the hour; T0 is on the hour, so the next is an hour later
    expect(Date.parse(cron.next!)).toBe(at(60 * MIN).getTime());
    expect(nextDue({ kind: 'cron', expr: '0 * * * *' }, at(61 * MIN))).toBe(
      at(120 * MIN).toISOString(),
    );
    setScheduleEnabled(every.id, false);
    expect(tickSchedules(at(45 * MIN)).map((f) => f.title)).toEqual([]);
    setScheduleEnabled(every.id, true, at(45 * MIN));
    expect(useSchedules.getState().schedules[0]!.next).toBe(at(65 * MIN).toISOString());
  });

  it('untouched names each Crux idle for N days, at most once a day', () => {
    addSchedule(
      {
        title: 'Still growing?',
        trigger: { kind: 'untouched', days: 2 },
        actions: [{ kind: 'alert' }],
      },
      at(-10 * DAY),
    );
    let fired = tickSchedules(at(0));
    expect(fired.map((f) => f.reason)).toEqual(['Lantern: untouched for 3 days.']);
    expect(tickSchedules(at(60 * MIN))).toEqual([]);
    fired = tickSchedules(at(DAY + MIN));
    expect(fired).toHaveLength(1);
    addSchedule(
      {
        title: 'Only this one',
        trigger: { kind: 'untouched', days: 0, cruxId: 'c2' },
        actions: [{ kind: 'alert' }],
      },
      at(-10 * DAY),
    );
    expect(tickSchedules(at(0)).map((f) => f.title)).toContain('Only this one');
  });

  it('an event trigger fires on the matching event, optionally for one Crux, and runs tools and prompts', async () => {
    addSchedule(
      {
        title: 'After every snapshot',
        trigger: { kind: 'event', event: 'snapshot', cruxId: 'c1' },
        actions: [
          { kind: 'tool', cruxId: 'c1', tool: 'list_files', input: {} },
          { kind: 'prompt', cruxId: 'c1', prompt: 'Summarise the change' },
          { kind: 'tool', cruxId: 'c1', tool: 'explode', input: {} },
        ],
      },
      at(0),
    );
    expect(onEvent({ name: 'snapshot', at: at(MIN).toISOString(), cruxId: 'c2' })).toEqual([]);
    expect(onEvent({ name: 'published', at: at(MIN).toISOString(), cruxId: 'c1' })).toEqual([]);
    const fired = onEvent({ name: 'snapshot', at: at(MIN).toISOString(), cruxId: 'c1' });
    expect(fired).toHaveLength(1);
    await flush();
    expect(tools).toEqual(['c1:list_files', 'c1:explode']);
    expect(prompts).toEqual(['c1:Summarise the change']);
    const titles = useAlerts.getState().alerts.map((a) => a.title);
    expect(titles).toContain('After every snapshot · list_files');
    expect(titles).toContain('After every snapshot · Lantern');
    expect(titles).toContain('After every snapshot · explode failed');
    expect(useAlerts.getState().alerts.find((a) => a.title.endsWith('list_files'))!.body).toBe(
      'Wrote NOTES.md',
    );
  });

  it("reads the first day's records, refuses what it cannot, and describes itself", () => {
    setSetting(
      SCHEDULES_KEY,
      JSON.stringify([
        {
          id: 'r',
          kind: 'remind',
          title: 'Friday',
          body: 'Copy',
          when: '2026-09-25T17:00:00.000Z',
          repeat: 'weekly',
          enabled: true,
        },
        { id: 'n', kind: 'nudge', title: 'Nudge', days: 3, enabled: true },
        {
          id: 'x',
          title: 'Bad cron',
          enabled: true,
          trigger: { kind: 'cron', expr: 'nope' },
          actions: [{ kind: 'alert' }],
        },
        {
          id: 'y',
          title: 'No actions',
          enabled: true,
          trigger: { kind: 'every', minutes: 5 },
          actions: [],
        },
        {
          id: 'z',
          title: 'Good',
          enabled: true,
          trigger: { kind: 'event', event: 'launch' },
          actions: [{ kind: 'notify' }, { kind: 'bogus' }],
        },
      ]),
    );
    const loaded = initSchedules();
    expect(loaded.map((s) => s.id)).toEqual(['r', 'n', 'z']);
    expect(loaded[0]!.trigger.kind).toBe('cron');
    expect(loaded[0]!.actions).toEqual([{ kind: 'alert', body: 'Copy' }]);
    expect(loaded[1]!.trigger).toEqual({ kind: 'untouched', days: 3 });
    expect(loaded[2]!.actions).toEqual([{ kind: 'notify' }]);
    const title = (id?: string) => (id === 'c1' ? 'Lantern' : 'a Crux');
    expect(describeTrigger({ kind: 'every', minutes: 120 }, title)).toBe('every 2 hours');
    expect(describeTrigger({ kind: 'event', event: 'published', cruxId: 'c1' }, title)).toBe(
      'when a Crux is shared in Lantern',
    );
    expect(describeTrigger({ kind: 'untouched', days: 1 }, title)).toBe(
      'any Crux untouched for 1 day',
    );
    removeSchedule('r');
    expect(JSON.parse(getSetting(SCHEDULES_KEY)!).map((s: { id: string }) => s.id)).toEqual([
      'n',
      'z',
    ]);
  });
});
