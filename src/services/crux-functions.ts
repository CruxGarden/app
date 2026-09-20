import type { Artifact } from '@/api/types';
import client from '@/api/client';
import { pathOf } from '@/lib/artifact-path';
import { getServices } from './index';

/**
 * Crux Functions (CRUX-FUNCTIONS-PLAN, F0 + F6): the small handlers in a
 * crux's `functions/` folder — its backend, run by the API where the crux
 * is published. This is the app's half: what the folder holds, the
 * When → Then rows that write a handler without code, a starter HTTP
 * handler, and calling a published crux's functions and events as the
 * signed-in person (the same API the page's `crux.fn` / `crux.emit` use).
 */
export const FUNCTIONS_DIR = 'functions/';

export interface FunctionFile {
  name: string;
  path: string;
  kind: 'http' | 'event';
  /** For an `on-<event>.js` handler: the event it answers. */
  event?: string;
}

export function functionFiles(artifacts: Artifact[]): FunctionFile[] {
  const out: FunctionFile[] = [];
  for (const a of artifacts) {
    const path = pathOf(a);
    const m = /^functions\/([A-Za-z0-9._-]+)\.js$/.exec(path);
    if (!m) continue;
    const name = m[1]!;
    const event = name.startsWith('on-') ? name.slice(3) : undefined;
    out.push({ name, path, kind: event ? 'event' : 'http', ...(event ? { event } : {}) });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

/** A When → Then row: an event the crux emits, and what to do about it. */
export interface WhenThen {
  /** The event name — `ping`, `order`, or `store:write` for a Store write. */
  event: string;
  /** A pattern wider than the name: `score*`, `store:*`, `*`. */
  match?: string;
  then:
    | { kind: 'store'; key: string; value: 'event' | string }
    | { kind: 'emit'; event: string }
    | { kind: 'log' };
}

const q = (s: string) => JSON.stringify(s);

/** The handler file a row becomes — plain, readable, the person's to edit. */
export function handlerSource(rule: WhenThen): string {
  const lines: string[] = [];
  lines.push(`// functions/on-${rule.event}.js — runs when this crux emits "${rule.event}".`);
  lines.push(`// Made from a When → Then row in the Share pane; edit freely.`);
  if (rule.match && rule.match !== rule.event) lines.push(`export const match = ${q(rule.match)};`);
  lines.push('export default async function (req, ctx) {');
  switch (rule.then.kind) {
    case 'store':
      lines.push(
        rule.then.value === 'event'
          ? `  await ctx.store.set(${q(rule.then.key)}, ctx.event.data, 'public');`
          : `  await ctx.store.set(${q(rule.then.key)}, ${q(rule.then.value)}, 'public');`,
      );
      lines.push(`  return { wrote: ${q(rule.then.key)} };`);
      break;
    case 'emit':
      lines.push(`  await ctx.emit(${q(rule.then.event)}, ctx.event.data);`);
      lines.push(`  return { emitted: ${q(rule.then.event)} };`);
      break;
    case 'log':
      lines.push(`  ctx.log('heard', ctx.event.name, ctx.event.data);`);
      lines.push(`  return { heard: ctx.event.name };`);
      break;
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** A first HTTP handler to start from: echoes what it was sent, signed by the visitor. */
export const STARTER_SOURCE = `// functions/hello.js — POST <api>/fn/<cruxId>/hello, or crux.fn('hello', body) from the page.
export default async function (req, ctx) {
  const body = await req.json();
  ctx.log('hello from', ctx.visitor ? ctx.visitor.id : 'a visitor');
  return ctx.json({ ok: true, echo: body, at: ctx.now() });
}
`;

const NAME_RE = /^[A-Za-z0-9._-]+$/;

export function validateEventName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Name the event.';
  if (!/^[A-Za-z0-9._:*-]+$/.test(n)) return 'Letters, digits, dots, dashes and colons only.';
  return null;
}

export async function writeEventHandler(cruxId: string, rule: WhenThen): Promise<string> {
  const event = rule.event.trim();
  const problem = validateEventName(event);
  if (problem) throw new Error(problem);
  const fileEvent = event.replace(/[:*]/g, '-').replace(/-+$/, '') || 'any';
  if (!NAME_RE.test(fileEvent)) throw new Error('That event cannot name a file.');
  const path = `${FUNCTIONS_DIR}on-${fileEvent}.js`;
  const source = handlerSource({
    ...rule,
    event: fileEvent,
    match: rule.match ?? (event !== fileEvent ? event : undefined),
  });
  await getServices().artifact.create({
    resourceId: cruxId,
    resourceType: 'crux',
    content: source,
    mimeType: 'text/javascript',
    meta: { path },
  });
  return path;
}

export async function writeStarterFunction(cruxId: string, name = 'hello'): Promise<string> {
  if (!NAME_RE.test(name)) throw new Error('Letters, digits, dots and dashes only.');
  const path = `${FUNCTIONS_DIR}${name}.js`;
  await getServices().artifact.create({
    resourceId: cruxId,
    resourceType: 'crux',
    content: STARTER_SOURCE.replaceAll('hello', name),
    mimeType: 'text/javascript',
    meta: { path },
  });
  return path;
}

/** What the API can run for a published crux. */
export async function listPublishedFunctions(cruxId: string): Promise<FunctionFile[]> {
  const res = await client.get<FunctionFile[]>(`/fn/${cruxId}`);
  return res.data;
}

export interface CallResult {
  status: number;
  body: unknown;
  ms: number | null;
  logs: string[];
}

/** Run a published crux's HTTP handler as the signed-in person. */
export async function callFunction(
  cruxId: string,
  name: string,
  body: unknown = {},
): Promise<CallResult> {
  const res = await client.post(`/fn/${cruxId}/${encodeURIComponent(name)}`, body, {
    validateStatus: () => true,
  });
  const logs = res.headers['x-crux-function-logs'];
  return {
    status: res.status,
    body: res.data,
    ms: res.headers['x-crux-function-ms'] ? Number(res.headers['x-crux-function-ms']) : null,
    logs: typeof logs === 'string' ? decodeURIComponent(logs).split('\n') : [],
  };
}

/** Emit an event on a published crux: its handlers run; the answer says how many. */
export async function emitEvent(
  cruxId: string,
  name: string,
  data: unknown = {},
): Promise<{ event: string; handlers: number; results: Record<string, CallResult> }> {
  const res = await client.post(`/events/${cruxId}/${encodeURIComponent(name)}`, data);
  return res.data;
}
