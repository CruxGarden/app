import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALERTS_KEY,
  alertAge,
  doneAlert,
  initAlerts,
  openAlerts,
  raiseAlert,
  resolveAlertsByKey,
  snoozeAlert,
  useAlerts,
} from './alerts';
import { getSetting, setSetting } from './settings';

describe('alerts inbox (GARDEN-SCHEDULER-PLAN)', () => {
  beforeEach(() => {
    setSetting(ALERTS_KEY, '[]');
    initAlerts();
  });

  it('raises, deduplicates by key while open, and starts again after done', () => {
    const a = raiseAlert({
      key: 'tending:1',
      kind: 'tending',
      title: 'Lantern · Main',
      body: 'Wants to run Bash',
    });
    const b = raiseAlert({
      key: 'tending:1',
      kind: 'tending',
      title: 'Lantern · Main',
      body: 'Still waiting',
    });
    expect(b.id).toBe(a.id);
    expect(useAlerts.getState().alerts).toHaveLength(1);
    expect(openAlerts()[0]!.body).toBe('Still waiting');
    doneAlert(a.id);
    expect(openAlerts()).toHaveLength(0);
    const c = raiseAlert({
      key: 'tending:1',
      kind: 'tending',
      title: 'Lantern · Main',
      body: 'Again',
    });
    expect(c.id).not.toBe(a.id);
    expect(openAlerts()).toHaveLength(1);
  });

  it('snoozes until a time, or until the next launch, and persists in the Garden', () => {
    const a = raiseAlert({ key: 'k', kind: 'reminder', title: 'Friday', body: 'Review the copy' });
    snoozeAlert(a.id, new Date(Date.now() + 60_000).toISOString());
    expect(openAlerts()).toHaveLength(0);
    expect(openAlerts(undefined, new Date(Date.now() + 120_000))).toHaveLength(1);
    snoozeAlert(a.id, 'launch');
    expect(openAlerts(undefined, new Date(Date.now() + 10 * 86400_000))).toHaveLength(0);
    // Written to the setting, so a .garden export carries it…
    expect(JSON.parse(getSetting(ALERTS_KEY)!)).toHaveLength(1);
    // …and the next launch wakes a "later".
    const back = initAlerts();
    expect(back[0]!.state).toBe('new');
    expect(openAlerts()).toHaveLength(1);
  });

  it('resolves by key, keeps newest first, and caps the list', () => {
    raiseAlert({ key: 'a', kind: 'tending', title: 'A', body: '', at: '2026-09-19T01:00:00.000Z' });
    raiseAlert({ key: 'b', kind: 'tending', title: 'B', body: '', at: '2026-09-19T02:00:00.000Z' });
    expect(useAlerts.getState().alerts.map((a) => a.title)).toEqual(['B', 'A']);
    resolveAlertsByKey(['a', 'nope']);
    expect(openAlerts().map((a) => a.title)).toEqual(['B']);
    for (let i = 0; i < 250; i++)
      raiseAlert({ key: `n${i}`, kind: 'nudge', title: `n${i}`, body: '' });
    expect(useAlerts.getState().alerts.length).toBeLessThanOrEqual(200);
  });

  it('ignores a corrupt setting and never trusts a shape it does not know', () => {
    setSetting(ALERTS_KEY, '{"not":"a list"}');
    expect(initAlerts()).toEqual([]);
    setSetting(
      ALERTS_KEY,
      JSON.stringify([
        { id: 'x' },
        { id: 'y', key: 'k', kind: 'run', at: 'now', title: 't', body: 'b', state: 'new' },
      ]),
    );
    expect(initAlerts().map((a) => a.id)).toEqual(['y']);
  });

  it('describes age briefly', () => {
    const now = new Date('2026-09-19T12:00:00Z');
    expect(alertAge('2026-09-19T11:59:50Z', now)).toBe('just now');
    expect(alertAge('2026-09-19T11:30:00Z', now)).toBe('30 min ago');
    expect(alertAge('2026-09-19T09:00:00Z', now)).toBe('3 h ago');
    expect(alertAge('2026-09-17T12:00:00Z', now)).toBe('2 d ago');
  });
});
