import type { IncludedSpend, IncludedUsage } from '@/api/inference';
import { formatMicrodollars as dollars } from '@/api/billing';

export { dollars };

/**
 * Plain-language readings of the included allowance (customer review CR02).
 * Pure: the composer status, Settings → Usage and their tests share them.
 */

/** "5 hours" / "30 days" for a window's length. */
export function windowName(durationHours: number): string {
  return durationHours % 24 === 0 && durationHours >= 24
    ? `${durationHours / 24} days`
    : `${durationHours} hours`;
}

type Window = IncludedUsage['windows'][number];

/** The window with the least left: the one that decides what fits next. */
export function bindingWindow(usage: Pick<IncludedUsage, 'windows'>): Window | null {
  const usable = usage.windows.filter((w) => w.limitMicrodollars > 0);
  if (!usable.length) return null;
  return usable.reduce((a, b) => (b.remainingMicrodollars < a.remainingMicrodollars ? b : a));
}

/**
 * When allowance starts returning. For a pause, the latest release among the
 * windows that cannot cover the minimum (each must return some); otherwise
 * the binding window's next release.
 */
function releaseAt(usage: IncludedUsage, minimum: number | null): string | null {
  const short =
    minimum === null ? [] : usage.windows.filter((w) => w.remainingMicrodollars < minimum);
  const candidates = (short.length ? short : [bindingWindow(usage)].filter((w) => !!w)) as Window[];
  return (
    candidates
      .map((w) => w.nextReleaseAt)
      .filter((v): v is string => !!v)
      .sort()
      .at(-1) ?? null
  );
}

/** "3:40 PM" today, "Tue 3:40 PM" this week, otherwise "Oct 12, 3:40 PM". */
export function formatRelease(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  if (Math.abs(at.getTime() - now.getTime()) < 6 * 86_400_000)
    return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export type ComposerAllowance =
  | { kind: 'paused'; until: string | null }
  | { kind: 'shorter'; until: string | null }
  | { kind: 'nearly' }
  | { kind: 'ok' };

/** Used fraction that counts as "nearly at the limit". */
export const NEARLY_USED = 0.8;

/**
 * What the composer says about the next request. The server's `nextRequest`
 * decides (it knows the reservation); an older server without it falls back
 * to "nothing left" and the 80 %-used warning.
 */
export function composerAllowance(usage: IncludedUsage): ComposerAllowance {
  const next = usage.nextRequest;
  if (next) {
    if (!next.fits) return { kind: 'paused', until: releaseAt(usage, next.minimumMicrodollars) };
    if (!next.fullLengthFits) return { kind: 'shorter', until: releaseAt(usage, null) };
  } else if (usage.windows.some((w) => w.limitMicrodollars > 0 && w.remainingMicrodollars <= 0)) {
    return { kind: 'paused', until: releaseAt(usage, 1) };
  }
  if (
    usage.windows.some(
      (w) => w.limitMicrodollars > 0 && w.usedMicrodollars >= w.limitMicrodollars * NEARLY_USED,
    )
  )
    return { kind: 'nearly' };
  return { kind: 'ok' };
}

/** "$1.10 left in your 5-hour allowance" — the binding window, in plain units. */
export function remainingLine(usage: Pick<IncludedUsage, 'windows'>): string | null {
  const w = bindingWindow(usage);
  if (!w) return null;
  const span =
    w.durationHours % 24 === 0 && w.durationHours >= 24
      ? `${w.durationHours / 24}-day`
      : `${w.durationHours}-hour`;
  return `${dollars(w.remainingMicrodollars)} left in your ${span} allowance`;
}

export interface SpendRow {
  /** cruxId, or "other" for unattributed and unknown Cruxes together. */
  key: string;
  title: string;
  chatMicrodollars: number;
  imageMicrodollars: number;
  requests: number;
}

/**
 * "Where it went": spend per Crux with chat and images apart. Crux titles are
 * resolved locally; unattributed requests and Cruxes this Garden does not know
 * fold into one "Other" row. Largest first, Other last.
 */
export function spendByCrux(
  rows: IncludedSpend[],
  titleOf: (cruxId: string) => string | undefined,
): SpendRow[] {
  const byKey = new Map<string, SpendRow>();
  for (const row of rows) {
    const title = row.cruxId ? titleOf(row.cruxId) : undefined;
    const key = row.cruxId && title !== undefined ? row.cruxId : 'other';
    const entry = byKey.get(key) ?? {
      key,
      title: key === 'other' ? 'Other' : title || 'Untitled',
      chatMicrodollars: 0,
      imageMicrodollars: 0,
      requests: 0,
    };
    if (row.kind === 'image') entry.imageMicrodollars += row.microdollars;
    else entry.chatMicrodollars += row.microdollars;
    entry.requests += row.requests;
    byKey.set(key, entry);
  }
  const total = (r: SpendRow) => r.chatMicrodollars + r.imageMicrodollars;
  return [...byKey.values()]
    .filter((r) => total(r) > 0 || r.requests > 0)
    .sort((a, b) => (a.key === 'other' ? 1 : b.key === 'other' ? -1 : total(b) - total(a)));
}
