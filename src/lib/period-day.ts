/**
 * A billing-period bound or "as of" stamp as a short day ("Sep 1"). Period
 * bounds are UTC dates, so format in UTC — otherwise the 1st shows as the
 * 31st west of Greenwich. Null or invalid input renders a dash, never
 * "Invalid Date".
 */
export function periodDay(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' });
}
