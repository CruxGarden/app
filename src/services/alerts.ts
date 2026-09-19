/**
 * Alerts — the one inbox every source feeds (GARDEN-SCHEDULER-PLAN §2):
 * Tending attention transitions today, schedule reminders, nudges, finished
 * and failed runs, sync conflicts as they arrive. One list, newest first,
 * behind a bell in the TopBar, with Open, Snooze and Done.
 *
 * Kept in a Garden setting (so a `.garden` export carries it), capped, and
 * deduplicated by key while an alert is open: the same pending decision
 * observed twice is one alert. An alert never carries prompt text or tool
 * arguments — names and reasons only, the rule Tending's notifications set.
 */
import { create } from 'zustand';
import { getSetting, setSetting } from './settings';
import type { TendingTarget } from './tending-state';

export const ALERTS_KEY = 'cruxgarden:alerts';
const CAP = 200;

export type AlertKind = 'tending' | 'reminder' | 'nudge' | 'run' | 'sync';

export interface Alert {
  id: string;
  /** Stable identity of the cause; a second observation of it updates rather than duplicates. */
  key: string;
  kind: AlertKind;
  at: string;
  title: string;
  body: string;
  cruxId?: string;
  /** Where Open goes: a Tending target, revalidated when clicked. */
  target?: TendingTarget;
  state: 'new' | 'snoozed' | 'done';
  /** ISO time the snooze ends, or 'launch' for "when I am next here". */
  until?: string;
  doneAt?: string;
}

interface AlertsState {
  alerts: Alert[];
  ready: boolean;
}

export const useAlerts = create<AlertsState>(() => ({ alerts: [], ready: false }));

function persist(alerts: Alert[]) {
  setSetting(ALERTS_KEY, JSON.stringify(alerts.slice(0, CAP)));
}

function isAlert(v: unknown): v is Alert {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.key === 'string' &&
    typeof a.kind === 'string' &&
    typeof a.at === 'string' &&
    typeof a.title === 'string' &&
    typeof a.body === 'string' &&
    ['new', 'snoozed', 'done'].includes(a.state as string)
  );
}

/** Load from the Garden; a snooze "until launch" ends now. */
export function initAlerts(now = new Date()) {
  let alerts: Alert[] = [];
  try {
    const raw = getSetting(ALERTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) alerts = parsed.filter(isAlert);
  } catch {
    alerts = [];
  }
  alerts = alerts.map((a) =>
    a.state === 'snoozed' && (a.until === 'launch' || (a.until && a.until <= now.toISOString()))
      ? { ...a, state: 'new', until: undefined }
      : a,
  );
  useAlerts.setState({ alerts, ready: true });
  return alerts;
}

/** Alerts that want attention now: new, or snoozed past their time. */
export function openAlerts(alerts = useAlerts.getState().alerts, now = new Date()): Alert[] {
  const t = now.toISOString();
  return alerts.filter(
    (a) =>
      a.state === 'new' ||
      (a.state === 'snoozed' && a.until !== 'launch' && !!a.until && a.until <= t),
  );
}

/**
 * Raise an alert. The same key while an alert is open (new or snoozed)
 * refreshes its body and time instead of adding a second; a key whose alert
 * was done starts again, because the thing happened again.
 */
export function raiseAlert(input: {
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  cruxId?: string;
  target?: TendingTarget;
  at?: string;
}): Alert {
  const alerts = useAlerts.getState().alerts;
  const at = input.at ?? new Date().toISOString();
  const existing = alerts.find((a) => a.key === input.key && a.state !== 'done');
  let next: Alert[];
  let alert: Alert;
  if (existing) {
    alert = {
      ...existing,
      title: input.title,
      body: input.body,
      at,
      target: input.target ?? existing.target,
    };
    next = alerts.map((a) => (a.id === existing.id ? alert : a));
  } else {
    alert = {
      id: crypto.randomUUID(),
      key: input.key,
      kind: input.kind,
      at,
      title: input.title,
      body: input.body,
      cruxId: input.cruxId,
      target: input.target,
      state: 'new',
    };
    next = [alert, ...alerts].slice(0, CAP);
  }
  next.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  useAlerts.setState({ alerts: next });
  persist(next);
  return alert;
}

function update(id: string, patch: Partial<Alert>) {
  const next = useAlerts.getState().alerts.map((a) => (a.id === id ? { ...a, ...patch } : a));
  useAlerts.setState({ alerts: next });
  persist(next);
}

/** Put it away until a time, or 'launch' for the next time the app opens. */
export function snoozeAlert(id: string, until: string | 'launch') {
  update(id, { state: 'snoozed', until });
}

export function doneAlert(id: string) {
  update(id, { state: 'done', until: undefined, doneAt: new Date().toISOString() });
}

/** Done for every open alert about a cause that no longer exists. */
export function resolveAlertsByKey(keys: Iterable<string>) {
  const set = new Set(keys);
  const now = new Date().toISOString();
  const next = useAlerts
    .getState()
    .alerts.map((a) =>
      a.state !== 'done' && set.has(a.key)
        ? { ...a, state: 'done' as const, until: undefined, doneAt: now }
        : a,
    );
  useAlerts.setState({ alerts: next });
  persist(next);
}

/** A short time-ago for the list. */
export function alertAge(at: string, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
