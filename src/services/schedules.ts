/**
 * The Scheduler (GARDEN-SCHEDULER-PLAN §2): a cron behind the scenes for
 * the garden. A Schedule is a **trigger** and a list of **actions**.
 *
 * Triggers: a time (`at`, once), an interval (`every`), a cron expression
 * (`cron`), a garden event (`event`: a snapshot, a share, a failure, the app
 * opening…), or a rule (`untouched`: a Crux idle for N days). Actions: raise
 * an alert, play a cue (an alarm), an OS notification, send a prompt to a
 * Crux as a Background Turn, or call a garden tool on a Crux.
 *
 * The ticker runs while the app is open — in the window, or from the menu
 * bar in docked mode — and reconciles on launch: something that came due
 * while the app was closed fires once and says so, never a silent skip.
 * Kept in a Garden setting so a `.garden` export carries the schedules.
 */
import { create } from 'zustand';
import { getSetting, setSetting } from './settings';
import { cronError, nextCron } from './cron';
import { onGardenEvent, type GardenEvent, type GardenEventName } from './garden-events';
import { runScheduleActions } from './schedule-actions';

export const SCHEDULES_KEY = 'cruxgarden:schedules';
const TICK_MS = 30_000;
/** Past this, a due schedule is reported as missed rather than as on time. */
export const MISSED_AFTER_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export type Trigger =
  | { kind: 'at'; when: string }
  | { kind: 'every'; minutes: number }
  | { kind: 'cron'; expr: string }
  | { kind: 'event'; event: GardenEventName; cruxId?: string }
  | { kind: 'untouched'; days: number; cruxId?: string };

export type Action =
  | { kind: 'alert'; title?: string; body?: string }
  | { kind: 'cue'; cue: string | object; times?: number }
  | { kind: 'notify' }
  | { kind: 'prompt'; cruxId: string; prompt: string }
  | { kind: 'tool'; cruxId: string; tool: string; input: Record<string, unknown> };

export interface Schedule {
  id: string;
  title: string;
  enabled: boolean;
  trigger: Trigger;
  actions: Action[];
  /** For at/every/cron: the next time it is due (ISO). */
  next?: string;
  lastFired?: string;
  /** For `untouched`: last time each Crux was nudged. */
  fired?: Record<string, string>;
}

export interface ScheduledCrux {
  id: string;
  title: string;
  updated: string;
}

/** What a firing produced, for tests and the log. */
export interface Firing {
  scheduleId: string;
  title: string;
  reason: string;
  missed: boolean;
}

export const useSchedules = create<{ schedules: Schedule[]; ready: boolean }>(() => ({
  schedules: [],
  ready: false,
}));

function persist(schedules: Schedule[]) {
  setSetting(SCHEDULES_KEY, JSON.stringify(schedules));
}

const EVENTS: GardenEventName[] = [
  'launch',
  'message',
  'toolDone',
  'snapshot',
  'published',
  'error',
  'alert',
];

function isTrigger(v: unknown): v is Trigger {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  switch (t.kind) {
    case 'at':
      return typeof t.when === 'string' && !Number.isNaN(Date.parse(t.when));
    case 'every':
      return typeof t.minutes === 'number' && t.minutes >= 1;
    case 'cron':
      return typeof t.expr === 'string' && cronError(t.expr) === null;
    case 'event':
      return EVENTS.includes(t.event as GardenEventName);
    case 'untouched':
      return typeof t.days === 'number' && t.days >= 0;
    default:
      return false;
  }
}

function isAction(v: unknown): v is Action {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  switch (a.kind) {
    case 'alert':
    case 'notify':
      return true;
    case 'cue':
      return typeof a.cue === 'string' || (!!a.cue && typeof a.cue === 'object');
    case 'prompt':
      return typeof a.cruxId === 'string' && typeof a.prompt === 'string' && !!a.prompt.trim();
    case 'tool':
      return typeof a.cruxId === 'string' && typeof a.tool === 'string' && !!a.input;
    default:
      return false;
  }
}

/** A record from the first day of schedules (remind/nudge) or from today. */
function upgrade(v: unknown): Schedule | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (typeof s.id !== 'string' || typeof s.title !== 'string' || typeof s.enabled !== 'boolean')
    return null;
  if (s.kind === 'remind' && typeof s.when === 'string') {
    const repeat = s.repeat === 'daily' ? '0 H * * *' : s.repeat === 'weekly' ? 'W' : null;
    const when = new Date(s.when);
    const trigger: Trigger = repeat
      ? {
          kind: 'cron',
          expr:
            repeat === 'W'
              ? `${when.getMinutes()} ${when.getHours()} * * ${when.getDay()}`
              : `${when.getMinutes()} ${when.getHours()} * * *`,
        }
      : { kind: 'at', when: s.when };
    return {
      id: s.id,
      title: s.title,
      enabled: s.enabled,
      trigger,
      actions: [{ kind: 'alert', body: typeof s.body === 'string' ? s.body : '' }],
      lastFired: typeof s.lastFired === 'string' ? s.lastFired : undefined,
    };
  }
  if (s.kind === 'nudge' && typeof s.days === 'number') {
    return {
      id: s.id,
      title: s.title,
      enabled: s.enabled,
      trigger: {
        kind: 'untouched',
        days: s.days,
        ...(typeof s.cruxId === 'string' ? { cruxId: s.cruxId } : {}),
      },
      actions: [{ kind: 'alert' }],
      fired: (s.fired as Record<string, string>) ?? undefined,
    };
  }
  if (!isTrigger(s.trigger) || !Array.isArray(s.actions)) return null;
  const actions = s.actions.filter(isAction);
  if (!actions.length) return null;
  return {
    id: s.id,
    title: s.title,
    enabled: s.enabled,
    trigger: s.trigger,
    actions,
    next: typeof s.next === 'string' ? s.next : undefined,
    lastFired: typeof s.lastFired === 'string' ? s.lastFired : undefined,
    fired: s.fired && typeof s.fired === 'object' ? (s.fired as Record<string, string>) : undefined,
  };
}

export function initSchedules(): Schedule[] {
  let schedules: Schedule[] = [];
  try {
    const raw = getSetting(SCHEDULES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) schedules = parsed.map(upgrade).filter((s): s is Schedule => !!s);
  } catch {
    schedules = [];
  }
  useSchedules.setState({ schedules, ready: true });
  return schedules;
}

/** The next due time for a timed trigger, strictly after `after`. */
export function nextDue(trigger: Trigger, after: Date, anchor?: string): string | null {
  switch (trigger.kind) {
    case 'at':
      return Date.parse(trigger.when) > after.getTime() ? trigger.when : null;
    case 'every': {
      const step = trigger.minutes * 60_000;
      const base = anchor ? Date.parse(anchor) : after.getTime();
      let t = base;
      while (t <= after.getTime()) t += step;
      return new Date(t).toISOString();
    }
    case 'cron':
      return nextCron(trigger.expr, after)?.toISOString() ?? null;
    default:
      return null;
  }
}

export function addSchedule(
  input: { title: string; trigger: Trigger; actions: Action[] },
  now = new Date(),
): Schedule {
  if (!isTrigger(input.trigger)) throw new Error('The trigger is not valid.');
  const actions = input.actions.filter(isAction);
  if (!actions.length) throw new Error('A schedule needs at least one action.');
  const schedule: Schedule = {
    id: crypto.randomUUID(),
    title: input.title.trim() || 'Schedule',
    enabled: true,
    trigger: input.trigger,
    actions,
  };
  // A one-off in the past is due now; a repeat starts from now.
  if (schedule.trigger.kind === 'at') schedule.next = schedule.trigger.when;
  else if (schedule.trigger.kind !== 'event' && schedule.trigger.kind !== 'untouched')
    schedule.next = nextDue(schedule.trigger, now, now.toISOString()) ?? undefined;
  const next = [...useSchedules.getState().schedules, schedule];
  useSchedules.setState({ schedules: next });
  persist(next);
  tickSchedules(now);
  return schedule;
}

export function removeSchedule(id: string) {
  const next = useSchedules.getState().schedules.filter((s) => s.id !== id);
  useSchedules.setState({ schedules: next });
  persist(next);
}

export function setScheduleEnabled(id: string, enabled: boolean, now = new Date()) {
  const next = useSchedules.getState().schedules.map((s) => {
    if (s.id !== id) return s;
    const on = { ...s, enabled };
    // Switching a repeat back on starts it from now, not from a stale `next`.
    if (enabled && (s.trigger.kind === 'every' || s.trigger.kind === 'cron'))
      on.next = nextDue(s.trigger, now, now.toISOString()) ?? undefined;
    return on;
  });
  useSchedules.setState({ schedules: next });
  persist(next);
}

let cruxSource: () => ScheduledCrux[] = () => [];
/** Where `untouched` reads the garden from; the app wires the garden store, a test wires a list. */
export function setScheduledCruxSource(source: () => ScheduledCrux[]) {
  cruxSource = source;
}

function fire(s: Schedule, reason: string, missed: boolean, now: Date, cruxId?: string): Firing {
  void runScheduleActions(s, { reason, missed, now, cruxId });
  return { scheduleId: s.id, title: s.title, reason, missed };
}

/**
 * One tick: fire everything due, advance repeats, record nudges. Returns
 * what fired, for tests. Event triggers fire from the bus, not here.
 */
export function tickSchedules(now = new Date()): Firing[] {
  const fired: Firing[] = [];
  const cruxes = cruxSource();
  const t = now.getTime();
  let changed = false;
  const next = useSchedules.getState().schedules.map((s): Schedule => {
    if (!s.enabled) return s;
    const tr = s.trigger;
    if (tr.kind === 'at' || tr.kind === 'every' || tr.kind === 'cron') {
      const due = s.next ? Date.parse(s.next) : tr.kind === 'at' ? Date.parse(tr.when) : NaN;
      if (Number.isNaN(due)) {
        // A repeat with no `next` yet (an upgraded record): start it from now.
        changed = true;
        return { ...s, next: nextDue(tr, now, now.toISOString()) ?? undefined };
      }
      if (due > t) return s;
      const missed = t - due > MISSED_AFTER_MS;
      const when = new Date(due);
      fired.push(
        fire(
          s,
          missed
            ? `Was due ${when.toLocaleString()}, while the app was closed.`
            : tr.kind === 'at'
              ? `Due ${when.toLocaleTimeString([], { timeStyle: 'short' })}.`
              : tr.kind === 'every'
                ? `Every ${tr.minutes} min.`
                : `On schedule.`,
          missed,
          now,
        ),
      );
      changed = true;
      const following = tr.kind === 'at' ? null : nextDue(tr, now, s.next);
      return following
        ? { ...s, next: following, lastFired: now.toISOString() }
        : { ...s, enabled: false, next: undefined, lastFired: now.toISOString() };
    }
    if (tr.kind === 'untouched') {
      const firedMap = { ...(s.fired ?? {}) };
      let touched = false;
      for (const c of cruxes) {
        if (tr.cruxId && c.id !== tr.cruxId) continue;
        const idle = t - Date.parse(c.updated);
        if (idle < tr.days * DAY_MS) continue;
        const last = firedMap[c.id] ? Date.parse(firedMap[c.id]!) : 0;
        if (t - last < DAY_MS) continue;
        const days = Math.floor(idle / DAY_MS);
        fired.push(
          fire(
            s,
            days === 0
              ? `${c.title}: not touched today.`
              : `${c.title}: untouched for ${days} ${days === 1 ? 'day' : 'days'}.`,
            false,
            now,
            c.id,
          ),
        );
        firedMap[c.id] = now.toISOString();
        touched = true;
      }
      if (!touched) return s;
      changed = true;
      return { ...s, fired: firedMap, lastFired: now.toISOString() };
    }
    return s;
  });
  if (changed) {
    useSchedules.setState({ schedules: next });
    persist(next);
  }
  return fired;
}

/** A garden event: fire every enabled event trigger that matches. */
export function onEvent(event: GardenEvent, now = new Date(event.at)): Firing[] {
  const fired: Firing[] = [];
  let changed = false;
  const next = useSchedules.getState().schedules.map((s): Schedule => {
    if (!s.enabled || s.trigger.kind !== 'event') return s;
    if (s.trigger.event !== event.name) return s;
    if (s.trigger.cruxId && s.trigger.cruxId !== event.cruxId) return s;
    fired.push(fire(s, event.detail ?? `On ${event.name}.`, false, now, event.cruxId));
    changed = true;
    return { ...s, lastFired: now.toISOString() };
  });
  if (changed) {
    useSchedules.setState({ schedules: next });
    persist(next);
  }
  return fired;
}

let timer: ReturnType<typeof setInterval> | null = null;
let offEvents: (() => void) | null = null;
/** Start the ticker: reconcile at once (a launch after time away), then every half minute. */
export function startScheduler(): () => void {
  if (!useSchedules.getState().ready) initSchedules();
  tickSchedules();
  if (!timer) timer = setInterval(() => tickSchedules(), TICK_MS);
  offEvents ??= onGardenEvent((e) => void onEvent(e));
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    offEvents?.();
    offEvents = null;
  };
}

/** A short line for the list. */
export function describeTrigger(tr: Trigger, cruxTitle: (id?: string) => string): string {
  switch (tr.kind) {
    case 'at':
      return new Date(tr.when).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    case 'every':
      return tr.minutes % 60 === 0
        ? `every ${tr.minutes / 60} ${tr.minutes === 60 ? 'hour' : 'hours'}`
        : `every ${tr.minutes} min`;
    case 'cron':
      return tr.expr;
    case 'event':
      return `when ${EVENT_LABEL[tr.event]}${tr.cruxId ? ` in ${cruxTitle(tr.cruxId)}` : ''}`;
    case 'untouched':
      return `${tr.cruxId ? cruxTitle(tr.cruxId) : 'any Crux'} untouched for ${tr.days} ${
        tr.days === 1 ? 'day' : 'days'
      }`;
  }
}
const EVENT_LABEL: Record<GardenEventName, string> = {
  launch: 'the app opens',
  message: 'a reply arrives',
  toolDone: 'a tool finishes',
  snapshot: 'a snapshot is taken',
  published: 'a Crux is shared',
  error: 'something fails',
  alert: 'an alert is raised',
};
