import { describe, it, expect, beforeEach } from 'vitest';
import {
  MOOD_SCHEDULES_KEY,
  SCHEDULES_KEY,
  addSchedule,
  formatRemaining,
  initSchedules,
  moodSchedules,
  nextDue,
  onEvent,
  pauseTimer,
  removeSchedule,
  resetTimer,
  runningTimers,
  setMoodSchedulesEnabled,
  setScheduleEnabled,
  setScheduleSource,
  setScheduledCruxSource,
  startTimer,
  syncMoodSchedules,
  tickSchedules,
  tickTimers,
  timerRemaining,
  useSchedules,
  describeTrigger,
} from './schedules';
import { setActionRuntime } from './schedule-actions';
import { ALERTS_KEY, initAlerts, openAlerts, useAlerts } from './alerts';
import { setSetting, getSetting } from './settings';
import { onGardenEvent, type GardenEvent } from './garden-events';

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
  const worn: string[] = [];
  beforeEach(() => {
    setSetting(SCHEDULES_KEY, '[]');
    setSetting(ALERTS_KEY, '[]');
    setSetting(MOOD_SCHEDULES_KEY, '');
    initSchedules();
    initAlerts();
    played.length = notified.length = prompts.length = tools.length = worn.length = 0;
    setActionRuntime({
      wearMood: async (id) => {
        worn.push(id);
        return id === 'nope' ? null : id;
      },
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

  it('a pomodoro: phases and rounds, pause and resume, its own events, a restart pauses it', async () => {
    const seen: GardenEvent[] = [];
    const off = onGardenEvent((e) => void seen.push(e));
    const s = addSchedule(
      {
        title: 'Pomodoro',
        trigger: {
          kind: 'timer',
          phases: [
            { label: 'Focus', minutes: 25 },
            { label: 'Break', minutes: 5 },
          ],
          rounds: 2,
        },
        actions: [{ kind: 'cue', cue: 'chime', times: 2 }, { kind: 'alert' }],
      },
      at(0),
    );
    expect(describeTrigger(s.trigger, () => '')).toBe('Focus 25 · Break 5 × 2');
    expect(timerRemaining(s, at(0))).toBeNull();
    expect(tickTimers(at(10 * MIN))).toEqual([]);

    startTimer(s.id, at(0));
    const running = () => useSchedules.getState().schedules[0]!;
    expect(runningTimers().map((x) => x.id)).toEqual([s.id]);
    expect(timerRemaining(running(), at(MIN))).toBe(24 * MIN);
    expect(formatRemaining(24 * MIN + 1000)).toBe('24:01');
    expect(tickTimers(at(24 * MIN))).toEqual([]);

    // Focus ends: the actions fire, the Break starts, the garden hears it.
    const first = tickTimers(at(25 * MIN));
    expect(first.map((f) => f.reason)).toEqual(['Focus done — Break for 5 min.']);
    await flush();
    expect(played).toEqual([2]);
    expect(useAlerts.getState().alerts[0]!.body).toBe('Focus done — Break for 5 min.');
    expect(seen.at(-1)).toMatchObject({
      name: 'timerPhase',
      data: { scheduleId: s.id, phase: 'Break' },
    });
    expect(running().timer).toMatchObject({ running: true, phase: 1, round: 0 });

    // Pause in the Break with 3 min left; resume later from there.
    pauseTimer(s.id, at(27 * MIN));
    expect(running().timer).toMatchObject({ running: false, remainingMs: 3 * MIN });
    expect(runningTimers()).toEqual([]);
    expect(tickTimers(at(60 * MIN))).toEqual([]);
    startTimer(s.id, at(60 * MIN));
    expect(timerRemaining(running(), at(60 * MIN))).toBe(3 * MIN);
    expect(tickTimers(at(63 * MIN)).map((f) => f.reason)).toEqual([
      'Break done — Focus for 25 min.',
    ]);
    expect(running().timer).toMatchObject({ phase: 0, round: 1 });

    // A running timer comes back paused where it was after a restart.
    initSchedules(at(70 * MIN));
    expect(running().timer).toMatchObject({ running: false, remainingMs: 18 * MIN });

    // The last round completes: timerDone, and the clock is gone.
    startTimer(s.id, at(70 * MIN));
    tickTimers(at(95 * MIN));
    const done = tickTimers(at(100 * MIN));
    expect(done.map((f) => f.reason)).toEqual(['Break done — Pomodoro complete after 2 rounds.']);
    expect(seen.at(-1)).toMatchObject({ name: 'timerDone', data: { timer: 'Pomodoro' } });
    expect(running().timer).toBeUndefined();
    resetTimer(s.id);
    off();
  });

  it('timers tied to events: one starts on a snapshot, another on the first finishing; a timer never restarts itself', () => {
    // What startScheduler wires in the app: the bus feeds the schedules.
    const off = onGardenEvent((e) => void onEvent(e));
    const focus = addSchedule(
      {
        title: 'Focus after a snapshot',
        trigger: {
          kind: 'timer',
          phases: [{ label: 'Focus', minutes: 10 }],
          rounds: 1,
          startOn: 'snapshot',
        },
        actions: [{ kind: 'alert' }],
      },
      at(0),
    );
    const cool = addSchedule(
      {
        title: 'Cool down',
        trigger: {
          kind: 'timer',
          phases: [{ label: 'Cool', minutes: 2 }],
          rounds: 0,
          startOn: 'timerDone',
        },
        actions: [{ kind: 'notify' }],
      },
      at(0),
    );
    expect(describeTrigger(focus.trigger, () => '')).toBe(
      'Focus 10 × 1, starts when a snapshot is taken',
    );
    expect(describeTrigger(cool.trigger, () => '')).toBe(
      'Cool 2 · repeats, starts when a timer finishes',
    );
    onEvent({ name: 'snapshot', at: at(0).toISOString(), cruxId: 'c1' });
    expect(runningTimers().map((s) => s.title)).toEqual(['Focus after a snapshot']);
    // Already running: a second snapshot does not restart it.
    onEvent({ name: 'snapshot', at: at(5 * MIN).toISOString() });
    expect(timerRemaining(useSchedules.getState().schedules[0]!, at(5 * MIN))).toBe(5 * MIN);
    tickTimers(at(10 * MIN));
    expect(runningTimers().map((s) => s.title)).toEqual(['Cool down']);
    // A repeating timer (rounds 0) cycles until stopped.
    tickTimers(at(12 * MIN));
    tickTimers(at(14 * MIN));
    expect(useSchedules.getState().schedules[1]!.timer).toMatchObject({ running: true, round: 2 });
    pauseTimer(cool.id, at(15 * MIN));
    expect(runningTimers()).toEqual([]);
    off();
  });

  it('the weather trigger fires on the kind it names, and wears a Mood', async () => {
    addSchedule(
      {
        title: 'Rainy day',
        trigger: { kind: 'weather', condition: 'rain' },
        actions: [{ kind: 'mood', moodId: 'mist-ridge' }],
      },
      at(0),
    );
    addSchedule(
      {
        title: 'Sky watch',
        trigger: { kind: 'weather', condition: 'any' },
        actions: [{ kind: 'mood', moodId: 'nope' }],
      },
      at(0),
    );
    const w = (kind: string, ms: number) =>
      onEvent({
        name: 'weather',
        at: at(ms).toISOString(),
        detail: `${kind} at Here.`,
        data: { kind },
      });
    expect(w('clear', 0).map((f) => f.title)).toEqual(['Sky watch']);
    expect(w('rain', MIN).map((f) => f.title)).toEqual(['Rainy day', 'Sky watch']);
    await flush();
    expect(worn).toEqual(['nope', 'mist-ridge', 'nope']);
    expect(useAlerts.getState().alerts.map((a) => a.title)).toEqual([
      'Sky watch · no such Mood',
      'Sky watch · no such Mood',
    ]);
  });

  it("a Mood's schedules come and go with the Mood, keep their switches, and obey the master switch", () => {
    addSchedule(
      { title: 'Mine', trigger: { kind: 'every', minutes: 30 }, actions: [{ kind: 'alert' }] },
      at(0),
    );
    const dusk = {
      id: 'ember-dusk',
      title: 'Dusk',
      trigger: { kind: 'cron' as const, expr: '0 18 * * *' },
      actions: [{ kind: 'mood' as const, moodId: 'last-light' }],
    };
    syncMoodSchedules(
      'ember-horizon',
      [dusk, { ...dusk, id: 'bad', trigger: { kind: 'cron', expr: 'x' } }],
      at(0),
    );
    const list = () => useSchedules.getState().schedules;
    expect(list().map((s) => [s.title, s.source ?? 'garden'])).toEqual([
      ['Mine', 'garden'],
      ['Dusk', 'mood'],
    ]);
    // The cron starts from now, not from the moment the Mood was worn.
    expect(list()[1]!.next).toBe(new Date('2026-09-19T18:00:00').toISOString());
    expect(moodSchedules('ember-horizon')).toEqual([{ ...dusk, enabled: true }]);

    // Switched off by the person: wearing the same Mood again keeps it off.
    setScheduleEnabled('ember-dusk', false, at(0));
    syncMoodSchedules('ember-horizon', [dusk], at(0));
    expect(list()[1]!.enabled).toBe(false);
    setScheduleEnabled('ember-dusk', true, at(0));

    // The master switch: the Mood's schedule does not fire while it is off.
    const dusk1 = new Date('2026-09-19T18:01:00'); // the cron is local time
    setMoodSchedulesEnabled(false);
    expect(tickSchedules(dusk1).map((f) => f.title)).toEqual(['Mine']);
    setMoodSchedulesEnabled(true);
    expect(tickSchedules(new Date(dusk1.getTime() + MIN)).map((f) => f.title)).toEqual(['Dusk']);

    // Kept in the garden: it survives the next Mood.
    setScheduleSource('ember-dusk', undefined);
    syncMoodSchedules('last-light', [], at(0));
    expect(list().map((s) => s.title)).toEqual(['Mine', 'Dusk']);
    // And a garden schedule can be handed to the worn Mood.
    setScheduleSource('ember-dusk', 'mood', 'last-light');
    expect(moodSchedules('last-light').map((s) => s.id)).toEqual(['ember-dusk']);
    syncMoodSchedules('plasma', [], at(0));
    expect(list().map((s) => s.title)).toEqual(['Mine']);
  });

  it('a sun trigger waits for a place, then fires at the next sunset there — computed, not fetched', () => {
    setSetting('cruxgarden:location', '');
    const s = addSchedule(
      {
        title: 'Evening Mood',
        trigger: { kind: 'sun', phase: 'sunset' },
        actions: [{ kind: 'mood', moodId: 'last-light' }],
      },
      at(0),
    );
    expect(s.next).toBeUndefined();
    expect(describeTrigger(s.trigger, () => '')).toBe('at sunset (set a place in the form)');
    expect(tickSchedules(at(MIN))).toEqual([]);
    setSetting('cruxgarden:location', JSON.stringify({ name: 'Greenwich', lat: 51.48, lon: 0 }));
    expect(tickSchedules(at(2 * MIN))).toEqual([]);
    const next = useSchedules.getState().schedules[0]!.next!;
    // 2026-09-19 at Greenwich: sunset about 18:11 UTC.
    expect(next.slice(0, 13)).toBe('2026-09-19T18');
    const fired = tickSchedules(new Date(Date.parse(next) + MIN));
    expect(fired.map((f) => f.reason)).toEqual([expect.stringMatching(/^Sunset at /)]);
    expect(useSchedules.getState().schedules[0]!.next!.slice(0, 10)).toBe('2026-09-20');
    setSetting('cruxgarden:location', '');
  });
});
