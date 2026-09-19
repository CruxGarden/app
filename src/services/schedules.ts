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
import {
  emitGardenEvent,
  onGardenEvent,
  type GardenEvent,
  type GardenEventName,
} from './garden-events';
import { runScheduleActions } from './schedule-actions';
import { getLocation, watchWeather, type WeatherKind } from './weather';
import { nextSun, type SunPhase } from './sun';

export const SCHEDULES_KEY = 'cruxgarden:schedules';
/** The master switch for the schedules a Mood brings along. */
export const MOOD_SCHEDULES_KEY = 'cruxgarden:moodSchedules';
const TICK_MS = 30_000;
/** Past this, a due schedule is reported as missed rather than as on time. */
export const MISSED_AFTER_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export type Trigger =
  | { kind: 'at'; when: string }
  | { kind: 'every'; minutes: number }
  | { kind: 'cron'; expr: string }
  | { kind: 'event'; event: GardenEventName; cruxId?: string }
  | { kind: 'untouched'; days: number; cruxId?: string }
  /**
   * A timer with phases — a pomodoro is Focus 25, Break 5, four rounds. It
   * runs on demand (Start, Pause, Reset) or starts itself on a garden event
   * (`startOn`), the actions fire at every phase change and at the end, it
   * raises `timerPhase` / `timerDone` so other schedules can follow it, and
   * the TopBar shows the countdown. Any number of them can run at once.
   */
  | { kind: 'timer'; phases: TimerPhase[]; rounds: number; startOn?: GardenEventName }
  /** The weather at the garden's location turns to this kind (or changes at all). */
  | { kind: 'weather'; condition: WeatherKind | 'any' }
  /** The sun at the garden's location: dawn, sunrise, sunset, dusk — computed here, no service. */
  | { kind: 'sun'; phase: SunPhase };

export interface TimerPhase {
  label: string;
  minutes: number;
}

/** Where a running timer is; absent when it has never been started. */
export interface TimerState {
  running: boolean;
  phase: number;
  round: number;
  /** ISO end of the current phase while running. */
  endsAt?: string;
  /** Milliseconds left while paused. */
  remainingMs?: number;
}

export type Action =
  | { kind: 'alert'; title?: string; body?: string }
  | { kind: 'cue'; cue: string | object; times?: number }
  | { kind: 'notify' }
  | { kind: 'prompt'; cruxId: string; prompt: string }
  | { kind: 'tool'; cruxId: string; tool: string; input: Record<string, unknown> }
  /** Wear a Mood — bundled or installed — by id. Time of day, weather, a timer's break. */
  | { kind: 'mood'; moodId: string };

export interface Schedule {
  id: string;
  title: string;
  enabled: boolean;
  /** For `timer`: its clock. */
  timer?: TimerState;
  /** A schedule a Mood brought along; it goes when the Mood goes. */
  source?: 'mood';
  moodId?: string;
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
  'timerPhase',
  'timerDone',
  'weather',
];
const WEATHER: (WeatherKind | 'any')[] = ['any', 'clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'];

export function isTrigger(v: unknown): v is Trigger {
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
    case 'timer':
      return (
        Array.isArray(t.phases) &&
        t.phases.length >= 1 &&
        t.phases.length <= 8 &&
        t.phases.every(
          (ph) =>
            !!ph &&
            typeof ph === 'object' &&
            typeof (ph as TimerPhase).label === 'string' &&
            typeof (ph as TimerPhase).minutes === 'number' &&
            (ph as TimerPhase).minutes > 0 &&
            (ph as TimerPhase).minutes <= 24 * 60,
        ) &&
        typeof t.rounds === 'number' &&
        t.rounds >= 0 &&
        t.rounds <= 99 &&
        (t.startOn === undefined || EVENTS.includes(t.startOn as GardenEventName))
      );
    case 'weather':
      return WEATHER.includes(t.condition as WeatherKind);
    case 'sun':
      return ['dawn', 'sunrise', 'sunset', 'dusk'].includes(t.phase as string);
    default:
      return false;
  }
}

export function isAction(v: unknown): v is Action {
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
    case 'mood':
      return typeof a.moodId === 'string' && !!a.moodId;
    default:
      return false;
  }
}

/** A record from the first day of schedules (remind/nudge) or from today. */
function upgrade(v: unknown, now = new Date()): Schedule | null {
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
  const timer = s.timer && typeof s.timer === 'object' ? (s.timer as TimerState) : undefined;
  return {
    id: s.id,
    title: s.title,
    enabled: s.enabled,
    trigger: s.trigger,
    actions,
    ...(s.source === 'mood' && typeof s.moodId === 'string'
      ? { source: 'mood' as const, moodId: s.moodId }
      : {}),
    // A timer that was running when the app closed comes back paused where it was.
    timer:
      timer && timer.running
        ? {
            ...timer,
            running: false,
            remainingMs: Math.max(0, Date.parse(timer.endsAt ?? '') - now.getTime()) || 0,
            endsAt: undefined,
          }
        : timer,
    next: typeof s.next === 'string' ? s.next : undefined,
    lastFired: typeof s.lastFired === 'string' ? s.lastFired : undefined,
    fired: s.fired && typeof s.fired === 'object' ? (s.fired as Record<string, string>) : undefined,
  };
}

export function initSchedules(now = new Date()): Schedule[] {
  let schedules: Schedule[] = [];
  try {
    const raw = getSetting(SCHEDULES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed))
      schedules = parsed.map((v) => upgrade(v, now)).filter((s): s is Schedule => !!s);
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
    case 'sun': {
      const loc = getLocation();
      return loc ? (nextSun(trigger.phase, after, loc.lat, loc.lon)?.toISOString() ?? null) : null;
    }
    default:
      return null;
  }
}

export interface ScheduleInput {
  title: string;
  trigger: Trigger;
  actions: Action[];
  enabled?: boolean;
  /** A Mood's schedule keeps the id its package gave it. */
  id?: string;
  source?: 'mood';
  moodId?: string;
}

function makeSchedule(input: ScheduleInput, now: Date): Schedule {
  if (!isTrigger(input.trigger)) throw new Error('The trigger is not valid.');
  const actions = input.actions.filter(isAction);
  if (!actions.length) throw new Error('A schedule needs at least one action.');
  const schedule: Schedule = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title.trim() || 'Schedule',
    enabled: input.enabled ?? true,
    trigger: input.trigger,
    actions,
    ...(input.source === 'mood' && input.moodId ? { source: 'mood', moodId: input.moodId } : {}),
  };
  // A one-off in the past is due now; a repeat starts from now.
  if (schedule.trigger.kind === 'at') schedule.next = schedule.trigger.when;
  else if (
    schedule.trigger.kind === 'every' ||
    schedule.trigger.kind === 'cron' ||
    schedule.trigger.kind === 'sun'
  )
    schedule.next = nextDue(schedule.trigger, now, now.toISOString()) ?? undefined;
  return schedule;
}

export function addSchedule(input: ScheduleInput, now = new Date()): Schedule {
  const schedule = makeSchedule(input, now);
  const next = [...useSchedules.getState().schedules, schedule];
  useSchedules.setState({ schedules: next });
  persist(next);
  tickSchedules(now);
  return schedule;
}

/** What a Mood Package carries: a schedule without its running state. */
export type MoodSchedule = Pick<Schedule, 'id' | 'title' | 'trigger' | 'actions'> & {
  enabled?: boolean;
};

/**
 * Wearing a Mood: its schedules replace the previous Mood's, keeping the
 * on/off of any the person already had by the same id. A cron the Mood set
 * for 07:00 does not fire the moment the Mood is worn — it starts from now.
 */
export function syncMoodSchedules(moodId: string, list: MoodSchedule[], now = new Date()) {
  const current = useSchedules.getState().schedules;
  const kept = current.filter((s) => s.source !== 'mood');
  const before = new Map(current.filter((s) => s.source === 'mood').map((s) => [s.id, s]));
  const mine = list.flatMap((m) => {
    try {
      const prior = before.get(m.id);
      return [
        makeSchedule(
          {
            ...m,
            enabled: prior && prior.moodId === moodId ? prior.enabled : (m.enabled ?? true),
            source: 'mood',
            moodId,
          },
          now,
        ),
      ];
    } catch {
      return [];
    }
  });
  const next = [...kept, ...mine];
  useSchedules.setState({ schedules: next });
  persist(next);
}

/** The schedules that belong to the worn Mood, in package form. */
export function moodSchedules(moodId?: string): MoodSchedule[] {
  return useSchedules
    .getState()
    .schedules.filter((s) => s.source === 'mood' && (!moodId || s.moodId === moodId))
    .map(({ id, title, trigger, actions, enabled }) => ({ id, title, trigger, actions, enabled }));
}

/** Make a schedule the Mood's (it travels in the package) or the garden's. */
export function setScheduleSource(id: string, source: 'mood' | undefined, moodId?: string) {
  const next = useSchedules
    .getState()
    .schedules.map((s) =>
      s.id !== id
        ? s
        : source === 'mood' && moodId
          ? { ...s, source: 'mood' as const, moodId }
          : { ...s, source: undefined, moodId: undefined },
    );
  useSchedules.setState({ schedules: next });
  persist(next);
}

export function moodSchedulesEnabled(): boolean {
  return getSetting(MOOD_SCHEDULES_KEY) !== 'off';
}
export function setMoodSchedulesEnabled(on: boolean) {
  setSetting(MOOD_SCHEDULES_KEY, on ? '' : 'off');
  // A change in what runs is a change in the list, for the page.
  useSchedules.setState({ schedules: [...useSchedules.getState().schedules] });
}

/** Enabled, and not a Mood's while the Mood switch is off. */
function active(s: Schedule): boolean {
  return s.enabled && (s.source !== 'mood' || moodSchedulesEnabled());
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
    if (
      enabled &&
      (s.trigger.kind === 'every' || s.trigger.kind === 'cron' || s.trigger.kind === 'sun')
    )
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
    if (!active(s)) return s;
    const tr = s.trigger;
    if (tr.kind === 'at' || tr.kind === 'every' || tr.kind === 'cron' || tr.kind === 'sun') {
      const due = s.next ? Date.parse(s.next) : tr.kind === 'at' ? Date.parse(tr.when) : NaN;
      if (Number.isNaN(due)) {
        // A repeat with no `next` yet (an upgraded record, or a sun trigger
        // waiting for a place): start it from now, or keep waiting.
        const next = nextDue(tr, now, now.toISOString()) ?? undefined;
        if (!next) return s;
        changed = true;
        return { ...s, next };
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
                : tr.kind === 'sun'
                  ? `${SUN_LABEL[tr.phase]} at ${when.toLocaleTimeString([], { timeStyle: 'short' })}.`
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
  const starting: string[] = [];
  const next = useSchedules.getState().schedules.map((s): Schedule => {
    if (!active(s)) return s;
    const tr = s.trigger;
    if (tr.kind === 'timer') {
      // A timer tied to an event starts itself; one already running keeps going.
      if (tr.startOn === event.name && !s.timer?.running) starting.push(s.id);
      return s;
    }
    if (tr.kind === 'weather') {
      if (event.name !== 'weather') return s;
      const kind = event.data?.kind;
      if (tr.condition !== 'any' && kind !== tr.condition) return s;
      fired.push(fire(s, event.detail ?? 'The weather changed.', false, now));
      changed = true;
      return { ...s, lastFired: now.toISOString() };
    }
    if (tr.kind !== 'event' || tr.event !== event.name) return s;
    if (tr.cruxId && tr.cruxId !== event.cruxId) return s;
    // A timer's own events never re-trigger the same timer.
    if (event.data?.scheduleId === s.id) return s;
    fired.push(fire(s, event.detail ?? `On ${event.name}.`, false, now, event.cruxId));
    changed = true;
    return { ...s, lastFired: now.toISOString() };
  });
  if (changed) {
    useSchedules.setState({ schedules: next });
    persist(next);
  }
  for (const id of starting) startTimer(id, now);
  return fired;
}

// ── Timers ────────────────────────────────────────────────────────────────

function saveTimer(id: string, patch: Partial<TimerState> | null) {
  const next = useSchedules.getState().schedules.map((s) => {
    if (s.id !== id || s.trigger.kind !== 'timer') return s;
    const base: TimerState = s.timer ?? { running: false, phase: 0, round: 0 };
    return { ...s, timer: patch ? { ...base, ...patch } : undefined };
  });
  useSchedules.setState({ schedules: next });
  persist(next);
}

/** Start, or resume where it paused. */
export function startTimer(id: string, now = new Date()) {
  const s = useSchedules.getState().schedules.find((x) => x.id === id);
  if (!s || s.trigger.kind !== 'timer') return;
  const t = s.timer ?? { running: false, phase: 0, round: 0 };
  const remaining = t.remainingMs ?? s.trigger.phases[t.phase]!.minutes * 60_000;
  saveTimer(id, {
    running: true,
    endsAt: new Date(now.getTime() + remaining).toISOString(),
    remainingMs: undefined,
  });
  ensureTimerTicker();
}

export function pauseTimer(id: string, now = new Date()) {
  const s = useSchedules.getState().schedules.find((x) => x.id === id);
  if (!s?.timer?.running) return;
  saveTimer(id, {
    running: false,
    remainingMs: Math.max(0, Date.parse(s.timer.endsAt ?? '') - now.getTime()),
    endsAt: undefined,
  });
}

export function resetTimer(id: string) {
  saveTimer(id, null);
}

/** Milliseconds left in the current phase, or null when not running/paused. */
export function timerRemaining(s: Schedule, now = new Date()): number | null {
  if (s.trigger.kind !== 'timer' || !s.timer) return null;
  if (s.timer.running) return Math.max(0, Date.parse(s.timer.endsAt ?? '') - now.getTime());
  return s.timer.remainingMs ?? null;
}

/** The running timers, for the TopBar. */
export function runningTimers(schedules = useSchedules.getState().schedules): Schedule[] {
  return schedules.filter((s) => s.trigger.kind === 'timer' && s.timer?.running);
}

/** Advance every running timer whose phase has ended; fire its actions. */
export function tickTimers(now = new Date()): Firing[] {
  const fired: Firing[] = [];
  let changed = false;
  const events: Parameters<typeof emitGardenEvent>[] = [];
  const next = useSchedules.getState().schedules.map((s): Schedule => {
    if (s.trigger.kind !== 'timer' || !s.timer?.running || !active(s)) return s;
    const endsAt = Date.parse(s.timer.endsAt ?? '');
    if (!(endsAt <= now.getTime())) return s;
    const phases = s.trigger.phases;
    const done = phases[s.timer.phase]!;
    let phase = s.timer.phase + 1;
    let round = s.timer.round;
    if (phase >= phases.length) {
      phase = 0;
      round += 1;
    }
    const finished = s.trigger.rounds > 0 && round >= s.trigger.rounds;
    changed = true;
    if (finished) {
      const reason = `${done.label} done — ${s.title} complete after ${round} ${round === 1 ? 'round' : 'rounds'}.`;
      fired.push(fire(s, reason, false, now));
      events.push(['timerDone', { detail: reason, data: { scheduleId: s.id, timer: s.title } }]);
      return { ...s, timer: undefined, lastFired: now.toISOString() };
    }
    const up = phases[phase]!;
    const reason = `${done.label} done — ${up.label} for ${up.minutes} min.`;
    fired.push(fire(s, reason, false, now));
    events.push([
      'timerPhase',
      { detail: reason, data: { scheduleId: s.id, timer: s.title, phase: up.label } },
    ]);
    return {
      ...s,
      lastFired: now.toISOString(),
      timer: {
        running: true,
        phase,
        round,
        endsAt: new Date(now.getTime() + up.minutes * 60_000).toISOString(),
      },
    };
  });
  if (changed) {
    useSchedules.setState({ schedules: next });
    persist(next);
  }
  for (const [name, extra] of events) emitGardenEvent(name, { ...extra, at: now.toISOString() });
  return fired;
}

let timerTicker: ReturnType<typeof setInterval> | null = null;
/** A one-second ticker only while a timer runs; the countdown needs it, the cron does not. */
function ensureTimerTicker() {
  if (timerTicker) return;
  timerTicker = setInterval(() => {
    tickTimers();
    if (!runningTimers().length) {
      clearInterval(timerTicker!);
      timerTicker = null;
    }
  }, 1000);
}

/** Ready-made timers for the form. */
export const TIMER_PRESETS: { id: string; label: string; phases: TimerPhase[]; rounds: number }[] =
  [
    {
      id: 'pomodoro',
      label: 'Pomodoro — Focus 25, Break 5, four rounds',
      phases: [
        { label: 'Focus', minutes: 25 },
        { label: 'Break', minutes: 5 },
      ],
      rounds: 4,
    },
    {
      id: 'deep',
      label: 'Deep work — Focus 50, Break 10, twice',
      phases: [
        { label: 'Focus', minutes: 50 },
        { label: 'Break', minutes: 10 },
      ],
      rounds: 2,
    },
    {
      id: 'egg',
      label: 'Egg timer — 5 minutes, once',
      phases: [{ label: 'Timer', minutes: 5 }],
      rounds: 1,
    },
  ];

let timer: ReturnType<typeof setInterval> | null = null;
let offEvents: (() => void) | null = null;
/** Start the ticker: reconcile at once (a launch after time away), then every half minute. */
export function startScheduler(): () => void {
  if (!useSchedules.getState().ready) initSchedules();
  tickSchedules();
  if (!timer) timer = setInterval(() => tickSchedules(), TICK_MS);
  if (runningTimers().length) ensureTimerTicker();
  offEvents ??= onGardenEvent((e) => void onEvent(e));
  // The weather is only fetched while a schedule is listening for it.
  const wantsWeather = () =>
    useSchedules.getState().schedules.some((s) => s.trigger.kind === 'weather' && active(s));
  watchWeather(wantsWeather());
  offWeather ??= useSchedules.subscribe(() => watchWeather(wantsWeather()));
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    offEvents?.();
    offEvents = null;
    offWeather?.();
    offWeather = null;
    watchWeather(false);
  };
}
let offWeather: (() => void) | null = null;

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
    case 'timer':
      return `${tr.phases.map((p) => `${p.label} ${p.minutes}`).join(' · ')}${
        tr.rounds ? ` × ${tr.rounds}` : ' · repeats'
      }${tr.startOn ? `, starts when ${EVENT_LABEL[tr.startOn]}` : ''}`;
    case 'weather':
      return tr.condition === 'any' ? 'when the weather changes' : `when it turns ${tr.condition}`;
    case 'sun':
      return `at ${SUN_LABEL[tr.phase].toLowerCase()}${getLocation() ? '' : ' (set a place in the form)'}`;
  }
}

const SUN_LABEL: Record<SunPhase, string> = {
  dawn: 'Dawn',
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  dusk: 'Dusk',
};

/** m:ss for a countdown. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
const EVENT_LABEL: Record<GardenEventName, string> = {
  launch: 'the app opens',
  message: 'a reply arrives',
  toolDone: 'a tool finishes',
  snapshot: 'a snapshot is taken',
  published: 'a Crux is shared',
  error: 'something fails',
  alert: 'an alert is raised',
  timerPhase: 'a timer changes phase',
  timerDone: 'a timer finishes',
  weather: 'the weather changes',
};
