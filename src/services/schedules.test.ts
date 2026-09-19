import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCHEDULES_KEY,
  addSchedule,
  initSchedules,
  nextOccurrence,
  removeSchedule,
  setScheduleEnabled,
  setScheduledCruxSource,
  tickSchedules,
  useSchedules,
} from './schedules';
import { ALERTS_KEY, initAlerts, openAlerts, useAlerts } from './alerts';
import { setSetting, getSetting } from './settings';

const T0 = new Date('2026-09-19T09:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;
const DAY = 86_400_000;

describe('schedules (GARDEN-SCHEDULER-PLAN)', () => {
  beforeEach(() => {
    setSetting(SCHEDULES_KEY, '[]');
    setSetting(ALERTS_KEY, '[]');
    initSchedules();
    initAlerts();
    setScheduledCruxSource(() => [
      { id: 'c1', title: 'Lantern', updated: at(-3 * DAY).toISOString() },
      { id: 'c2', title: 'Tide charts', updated: at(-2 * MIN).toISOString() },
    ]);
  });

  it('a reminder due now alerts once, on time; a missed one says so', () => {
    addSchedule(
      {
        kind: 'remind',
        title: 'Water the ferns',
        body: 'Both pots.',
        when: at(10 * MIN).toISOString(),
        repeat: 'none',
      },
      at(0),
    );
    expect(tickSchedules(at(9 * MIN))).toEqual([]);
    const raised = tickSchedules(at(11 * MIN));
    expect(raised.map((r) => r.title)).toEqual(['Water the ferns']);
    expect(openAlerts(undefined, at(11 * MIN))[0]!.body).toBe('Both pots.');
    // Fired once: a later tick does not repeat it, and it switched itself off.
    expect(tickSchedules(at(12 * MIN))).toEqual([]);
    expect(useSchedules.getState().schedules[0]!.enabled).toBe(false);

    // Missed while closed: the alert says when it was due.
    addSchedule(
      {
        kind: 'remind',
        title: 'Post the update',
        body: '',
        when: at(0).toISOString(),
        repeat: 'none',
      },
      at(2 * 60 * MIN),
    );
    tickSchedules(at(2 * 60 * MIN));
    const missed = openAlerts(undefined, at(2 * 60 * MIN)).find(
      (a) => a.title === 'Post the update',
    )!;
    expect(missed.body).toMatch(/while the app was closed/);
  });

  it('a repeating reminder advances to the next occurrence after now', () => {
    expect(nextOccurrence(at(0).toISOString(), 'daily', at(30 * MIN))).toBe(at(DAY).toISOString());
    expect(nextOccurrence(at(0).toISOString(), 'weekly', at(10 * DAY))).toBe(
      at(14 * DAY).toISOString(),
    );
    expect(nextOccurrence(at(0).toISOString(), 'none', at(1))).toBeNull();
    addSchedule(
      {
        kind: 'remind',
        title: 'Stand-up',
        body: '',
        when: at(0).toISOString(),
        repeat: 'daily',
      },
      at(-MIN),
    );
    tickSchedules(at(MIN));
    const s = useSchedules.getState().schedules[0]!;
    expect(s.kind === 'remind' && s.when).toBe(at(DAY).toISOString());
    expect(s.enabled).toBe(true);
    // Next day it fires again as a fresh alert (a new key), not a refresh of the old one.
    tickSchedules(at(DAY + MIN));
    expect(useAlerts.getState().alerts.filter((a) => a.title === 'Stand-up')).toHaveLength(2);
  });

  it('a nudge names each Crux untouched for N days, at most once a day', () => {
    addSchedule({ kind: 'nudge', title: 'Still growing?', days: 2 }, at(-10 * DAY));
    let raised = tickSchedules(at(0));
    expect(raised.map((r) => r.key)).toEqual([expect.stringMatching(/^nudge:.*:c1$/)]);
    const alert = openAlerts(undefined, at(0))[0]!;
    expect(alert.title).toBe('Lantern · Still growing?');
    expect(alert.body).toBe('Untouched for 3 days.');
    expect(tickSchedules(at(60 * MIN))).toEqual([]);
    raised = tickSchedules(at(DAY + MIN));
    expect(raised).toHaveLength(1);
    // Scoped to one Crux: the fresh one is never nudged.
    addSchedule({ kind: 'nudge', title: 'Only this one', days: 0, cruxId: 'c2' }, at(-10 * DAY));
    expect(tickSchedules(at(0)).map((r) => r.title)).toContain('Only this one');
  });

  it('persists in the Garden, survives a reload, and drops what it cannot read', () => {
    addSchedule(
      {
        kind: 'remind',
        title: 'Friday',
        body: '',
        when: at(DAY).toISOString(),
        repeat: 'weekly',
      },
      at(0),
    );
    const id = useSchedules.getState().schedules[0]!.id;
    setScheduleEnabled(id, false);
    expect(JSON.parse(getSetting(SCHEDULES_KEY)!)[0].enabled).toBe(false);
    expect(initSchedules()[0]!.enabled).toBe(false);
    removeSchedule(id);
    expect(initSchedules()).toEqual([]);
    setSetting(
      SCHEDULES_KEY,
      JSON.stringify([
        { id: 'x', kind: 'remind', title: 't', when: 'never', repeat: 'none', enabled: true },
        { id: 'y', kind: 'nudge', title: 'n', days: 1, enabled: true },
      ]),
    );
    expect(initSchedules().map((s) => s.id)).toEqual(['y']);
  });
});
