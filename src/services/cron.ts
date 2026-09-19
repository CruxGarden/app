/**
 * Cron, the five-field kind — minute hour day-of-month month day-of-week —
 * in local time, for Schedules (GARDEN-SCHEDULER-PLAN). Supports `*`, lists
 * (`1,15`), ranges (`9-17`), steps (a slash, as in every-15-minutes), names for months and
 * days (`jan`, `mon`), and the day-of-month/day-of-week OR rule when both
 * are restricted, the way Vixie cron does. No dependency; small enough to
 * read in one sitting.
 */

export interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  /** Whether day-of-month / day-of-week were restricted (not `*`), for the OR rule. */
  domAny: boolean;
  dowAny: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function names(field: string, table: string[], offset: number): string {
  return field.replace(/[a-z]{3}/gi, (m) => {
    const i = table.indexOf(m.toLowerCase());
    if (i < 0) throw new Error(`Unknown name "${m}"`);
    return String(i + offset);
  });
}

function parseField(raw: string, lo: number, hi: number, what: string): Set<number> {
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`Bad ${what} "${part}"`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error(`Bad ${what} step "${part}"`);
    let a = lo;
    let b = hi;
    if (m[1] !== '*') {
      const [x, y] = m[1]!.split('-').map(Number);
      a = x!;
      b = y === undefined ? (m[2] ? hi : x!) : y;
    }
    if (a < lo || b > hi || a > b) throw new Error(`${what} "${part}" is out of ${lo}–${hi}`);
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5)
    throw new Error('A cron expression has five fields: minute hour day month weekday');
  const [mi, h, d, mo, w] = parts as [string, string, string, string, string];
  const dow = parseField(names(w, DAYS, 0).replace(/\b7\b/g, '0'), 0, 6, 'weekday');
  return {
    minute: parseField(mi, 0, 59, 'minute'),
    hour: parseField(h, 0, 23, 'hour'),
    dom: parseField(d, 1, 31, 'day'),
    month: parseField(names(mo, MONTHS, 1), 1, 12, 'month'),
    dow,
    domAny: d === '*',
    dowAny: w === '*',
  };
}

function matchesDay(f: CronFields, t: Date): boolean {
  const dom = f.dom.has(t.getDate());
  const dow = f.dow.has(t.getDay());
  if (f.domAny && f.dowAny) return true;
  if (f.domAny) return dow;
  if (f.dowAny) return dom;
  return dom || dow;
}

/**
 * The first time strictly after `after` that matches, local time; null when
 * nothing matches within four years (a February 30th, say).
 */
export function nextCron(expr: string | CronFields, after: Date): Date | null {
  const f = typeof expr === 'string' ? parseCron(expr) : expr;
  const t = new Date(after.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const limit = after.getTime() + 4 * 366 * 86_400_000;
  while (t.getTime() <= limit) {
    if (!f.month.has(t.getMonth() + 1)) {
      t.setMonth(t.getMonth() + 1, 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }
    if (!matchesDay(f, t)) {
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }
    if (!f.hour.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!f.minute.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1, 0, 0);
      continue;
    }
    return t;
  }
  return null;
}

/** Whether `expr` parses; the message says what is wrong. */
export function cronError(expr: string): string | null {
  try {
    parseCron(expr);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A plain reading of common shapes; the raw expression otherwise. */
export function describeCron(expr: string): string {
  let f: CronFields;
  try {
    f = parseCron(expr);
  } catch {
    return expr;
  }
  const one = (s: Set<number>) => (s.size === 1 ? [...s][0]! : null);
  const mi = one(f.minute);
  const h = one(f.hour);
  const time = mi !== null && h !== null ? `at ${pad(h)}:${pad(mi)}` : null;
  const every = (s: Set<number>, lo: number, hi: number) => {
    const v = [...s].sort((a, b) => a - b);
    if (v.length < 2 || v[0] !== lo) return null;
    const step = v[1]! - v[0]!;
    if (v.every((x, i) => x === lo + i * step) && lo + v.length * step > hi) return step;
    return null;
  };
  if (f.month.size === 12 && f.domAny && f.dowAny) {
    if (time) return `every day ${time}`;
    if (f.hour.size === 24 && mi !== null)
      return mi === 0 ? 'every hour' : `every hour at :${pad(mi)}`;
    const stepMin = every(f.minute, 0, 59);
    if (f.hour.size === 24 && stepMin) return `every ${stepMin} minutes`;
    const stepHour = every(f.hour, 0, 23);
    if (mi === 0 && stepHour) return `every ${stepHour} hours`;
  }
  if (f.month.size === 12 && f.domAny && !f.dowAny && time) {
    const d = [...f.dow].sort((a, b) => a - b);
    const label =
      d.join() === '1,2,3,4,5'
        ? 'weekdays'
        : d.map((x) => DAYS[x]!.replace(/^\w/, (c) => c.toUpperCase())).join(', ');
    return `${label} ${time}`;
  }
  if (f.month.size === 12 && !f.domAny && f.dowAny && time && f.dom.size === 1)
    return `the ${[...f.dom][0]}${ordinal([...f.dom][0]!)} of every month ${time}`;
  return expr;
}
function ordinal(n: number) {
  return n % 10 === 1 && n !== 11
    ? 'st'
    : n % 10 === 2 && n !== 12
      ? 'nd'
      : n % 10 === 3 && n !== 13
        ? 'rd'
        : 'th';
}
