/**
 * Garden events — the moments the app already marks with a Sound Cue, made
 * available to anything that wants to hook them (GARDEN-SCHEDULER-PLAN):
 * a reply arrived, a tool finished, a snapshot was taken, a Crux was shared,
 * something failed, an alert was raised, the app launched. A Schedule can
 * trigger on any of them. Timers and the weather report here too, so a
 * timer can start another, and a Mood can follow the sky. Tiny and
 * synchronous; listeners never throw out.
 */
export type GardenEventName =
  | 'launch'
  | 'message'
  | 'toolDone'
  | 'snapshot'
  | 'published'
  | 'error'
  | 'alert'
  | 'timerPhase'
  | 'timerDone'
  | 'weather';

export interface GardenEvent {
  name: GardenEventName;
  at: string;
  cruxId?: string;
  /** A short human line about it, never prompt text. */
  detail?: string;
  /** Small facts about it: a timer's schedule id, the weather's kind. */
  data?: Record<string, string>;
}

export const GARDEN_EVENTS: { id: GardenEventName; label: string }[] = [
  { id: 'launch', label: 'The app opens' },
  { id: 'message', label: 'A reply arrives' },
  { id: 'toolDone', label: 'A tool finishes' },
  { id: 'snapshot', label: 'A snapshot is taken' },
  { id: 'published', label: 'A Crux is shared' },
  { id: 'error', label: 'Something fails' },
  { id: 'alert', label: 'An alert is raised' },
  { id: 'timerPhase', label: 'A timer changes phase' },
  { id: 'timerDone', label: 'A timer finishes' },
  { id: 'weather', label: 'The weather changes' },
];

type Listener = (event: GardenEvent) => void;
const listeners = new Set<Listener>();

export function onGardenEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitGardenEvent(
  name: GardenEventName,
  extra: { cruxId?: string; detail?: string; data?: Record<string, string>; at?: string } = {},
): GardenEvent {
  const event: GardenEvent = { name, at: extra.at ?? new Date().toISOString(), ...extra };
  for (const l of listeners) {
    try {
      l(event);
    } catch (err) {
      console.warn('[garden-events] listener failed', err);
    }
  }
  return event;
}
