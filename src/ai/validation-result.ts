/** What every tool validator answers; the executor formats the error for the model. */
export type ValidationResult = { valid: true } | { valid: false; error: string };

/** A string with something in it, trimmed, no longer than `max`; else null. */
export function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;
}
