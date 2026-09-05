/**
 * "Next figure in 6h 12m" — the daily figure changes at UTC midnight. A dim
 * line, updated each minute; no streaks, no history.
 */

export function msUntilUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, next - now.getTime());
}

/** `6h 12m`, `12m`, `<1m`, or `now`. Minutes round up so the line never reads 0m early. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  if (ms < 60_000) return '<1m';
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
