/**
 * The Scheduler (GARDEN-SCHEDULER-PLAN §2): garden-level records that say
 * *when*. Two kinds land first — a **reminder** (once, daily or weekly, with
 * a message and optionally a Crux) and a **nudge** (a rule: a Crux untouched
 * for N days). Both produce Alerts; nothing here runs a turn or touches a
 * Crux. Kept in a Garden setting so a `.garden` export carries them.
 *
 * The ticker runs in the app while it is open and reconciles on launch: a
 * reminder that came due while the app was closed becomes an alert that
 * says so, never a silent skip. Runs (a saved prompt as a Background Turn)
 * and Crux Function triggers are later steps of the plan.
 */
import { create } from 'zustand';
import { getSetting, setSetting } from './settings';
import { raiseAlert } from './alerts';

export const SCHEDULES_KEY = 'cruxgarden:schedules';
const TICK_MS = 30_000;
/** Past this, a due reminder is reported as missed rather than as on time. */
const MISSED_AFTER_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export type Repeat = 'none' | 'daily' | 'weekly';

export interface Reminder {
  id: string;
  kind: 'remind';
  title: string;
  body: string;
  cruxId?: string;
  /** ISO time of the next occurrence. */
  when: string;
  repeat: Repeat;
  enabled: boolean;
  lastFired?: string;
}

export interface Nudge {
  id: string;
  kind: 'nudge';
  title: string;
  /** A Crux untouched for this many days. 0 nudges about every Crux at once (useful to test). */
  days: number;
  /** One Crux, or every Crux in the garden when absent. */
  cruxId?: string;
  enabled: boolean;
  /** Last time each Crux was nudged, so a nudge repeats daily rather than every tick. */
  fired?: Record<string, string>;
}

export type Schedule = Reminder | Nudge;

export interface ScheduledCrux {
  id: string;
  title: string;
  updated: string;
}

export const useSchedules = create<{ schedules: Schedule[]; ready: boolean }>(() => ({
  schedules: [],
  ready: false,
}));

function persist(schedules: Schedule[]) {
  setSetting(SCHEDULES_KEY, JSON.stringify(schedules));
}

function isSchedule(v: unknown): v is Schedule {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (typeof s.id !== 'string' || typeof s.title !== 'string' || typeof s.enabled !== 'boolean')
    return false;
  if (s.kind === 'remind')
    return (
      typeof s.when === 'string' &&
      !Number.isNaN(Date.parse(s.when)) &&
      ['none', 'daily', 'weekly'].includes(s.repeat as string)
    );
  if (s.kind === 'nudge') return typeof s.days === 'number' && s.days >= 0;
  return false;
}

export function initSchedules(): Schedule[] {
  let schedules: Schedule[] = [];
  try {
    const raw = getSetting(SCHEDULES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) schedules = parsed.filter(isSchedule);
  } catch {
    schedules = [];
  }
  useSchedules.setState({ schedules, ready: true });
  return schedules;
}

export function addSchedule(
  input: Omit<Reminder, 'id' | 'enabled'> | Omit<Nudge, 'id' | 'enabled'>,
  now = new Date(),
) {
  const schedule = { ...input, id: crypto.randomUUID(), enabled: true } as Schedule;
  const next = [...useSchedules.getState().schedules, schedule];
  useSchedules.setState({ schedules: next });
  persist(next);
  // Something due already is due now, not in thirty seconds.
  tickSchedules(now);
  return schedule;
}

export function removeSchedule(id: string) {
  const next = useSchedules.getState().schedules.filter((s) => s.id !== id);
  useSchedules.setState({ schedules: next });
  persist(next);
}

export function setScheduleEnabled(id: string, enabled: boolean) {
  const next = useSchedules.getState().schedules.map((s) => (s.id === id ? { ...s, enabled } : s));
  useSchedules.setState({ schedules: next });
  persist(next);
}

/** The next occurrence strictly after `now`, for a repeating reminder. */
export function nextOccurrence(when: string, repeat: Repeat, now: Date): string | null {
  if (repeat === 'none') return null;
  const step = repeat === 'daily' ? DAY_MS : 7 * DAY_MS;
  let t = Date.parse(when);
  while (t <= now.getTime()) t += step;
  return new Date(t).toISOString();
}

let cruxSource: () => ScheduledCrux[] = () => [];
/** Where nudges read the garden from; the app wires the garden store, a test wires a list. */
export function setScheduledCruxSource(source: () => ScheduledCrux[]) {
  cruxSource = source;
}

/**
 * One tick: raise an alert for everything due, advance repeats, record
 * nudges. Pure over its inputs apart from the alerts it raises and the
 * schedules it writes back; returns what it raised, for tests.
 */
export function tickSchedules(now = new Date()): { key: string; title: string }[] {
  const raised: { key: string; title: string }[] = [];
  const cruxes = cruxSource();
  const byId = new Map(cruxes.map((c) => [c.id, c]));
  const t = now.getTime();
  let changed = false;
  const next = useSchedules.getState().schedules.map((s): Schedule => {
    if (!s.enabled) return s;
    if (s.kind === 'remind') {
      const due = Date.parse(s.when);
      if (due > t || (s.lastFired && Date.parse(s.lastFired) >= due)) return s;
      const missed = t - due > MISSED_AFTER_MS;
      const crux = s.cruxId ? byId.get(s.cruxId) : undefined;
      const key = `remind:${s.id}:${s.when}`;
      raiseAlert({
        key,
        kind: 'reminder',
        title: s.title,
        body: [
          s.body,
          crux ? `About ${crux.title}.` : '',
          missed ? `Was due ${new Date(due).toLocaleString()}, while the app was closed.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        cruxId: s.cruxId,
        at: now.toISOString(),
      });
      raised.push({ key, title: s.title });
      changed = true;
      const following = nextOccurrence(s.when, s.repeat, now);
      return following
        ? { ...s, when: following, lastFired: now.toISOString() }
        : { ...s, enabled: false, lastFired: now.toISOString() };
    }
    // A nudge: every matching Crux untouched for `days`, at most once a day each.
    const fired = { ...(s.fired ?? {}) };
    let touched = false;
    for (const c of cruxes) {
      if (s.cruxId && c.id !== s.cruxId) continue;
      const idle = t - Date.parse(c.updated);
      if (idle < s.days * DAY_MS) continue;
      const last = fired[c.id] ? Date.parse(fired[c.id]!) : 0;
      if (t - last < DAY_MS) continue;
      const days = Math.floor(idle / DAY_MS);
      const key = `nudge:${s.id}:${c.id}`;
      raiseAlert({
        key,
        kind: 'nudge',
        title: `${c.title} · ${s.title}`,
        body:
          days === 0
            ? 'Not touched today.'
            : `Untouched for ${days} ${days === 1 ? 'day' : 'days'}.`,
        cruxId: c.id,
        at: now.toISOString(),
      });
      raised.push({ key, title: s.title });
      fired[c.id] = now.toISOString();
      touched = true;
    }
    if (!touched) return s;
    changed = true;
    return { ...s, fired };
  });
  if (changed) {
    useSchedules.setState({ schedules: next });
    persist(next);
  }
  return raised;
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Start the ticker; reconciles at once (a launch after time away), then every half minute. */
export function startScheduler(): () => void {
  if (!useSchedules.getState().ready) initSchedules();
  tickSchedules();
  if (!timer) timer = setInterval(() => tickSchedules(), TICK_MS);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}
