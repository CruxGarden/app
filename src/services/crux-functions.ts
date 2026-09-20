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

/**
 * `crux.js` — the page's handle on its crux, shipped as a file in the crux so
 * the same page works in the workspace preview (where Crux Garden serves the
 * folder verbatim, ADR 0003) and at the shared address (where the publish
 * injection's own client takes over and this file steps aside). In the
 * workspace every call is a postMessage to Crux Garden: the Store answers
 * from the local Store, functions run in the local runner, events reach
 * `crux.on` the same way.
 */
export const CLIENT_PATH = 'crux.js';
export const CLIENT_SOURCE = `// crux.js — this page's handle on its crux: crux.store, crux.fn, crux.emit, crux.on.
// Written by Crux Garden. In the workspace it talks to Crux Garden; where the crux is
// shared, Crux Garden's own client is injected and this file does nothing.
(function () {
  if (window.crux && window.crux.fn) return;
  window.crux = window.crux || {};
  var framed = window.parent !== window;
  function ask(type, payload) {
    return new Promise(function (resolve, reject) {
      if (!framed) return reject(new Error('Open this page in Crux Garden, or share the crux'));
      var id = Math.random().toString(36).slice(2);
      var timer = setTimeout(function () { window.removeEventListener('message', hear); reject(new Error(type + ' timed out')); }, 8000);
      function hear(e) {
        if (!e.data || e.data.id !== id || e.data.type !== type + ':res') return;
        clearTimeout(timer); window.removeEventListener('message', hear); resolve(e.data);
      }
      window.addEventListener('message', hear);
      window.parent.postMessage(Object.assign({ type: type, id: id }, payload), '*');
    });
  }
  if (!window.crux.store) {
    window.crux.store = {
      get: function (key) { return ask('crux:store:get', { key: key }).then(function (r) { return r.value === undefined ? null : r.value; }); },
      set: function (key, value, opts) {
        var mode = (opts && opts.mode) || 'protected';
        return ask('crux:store:set', { key: key, value: value, mode: mode }).then(function (r) { if (r.error) throw new Error(r.error); });
      },
      increment: function (key, by) { return ask('crux:store:inc', { key: key, by: by || 1 }).then(function (r) { return r.value; }); },
      delete: function (key) { window.parent.postMessage({ type: 'crux:store:del', key: key }, '*'); return Promise.resolve(); },
      list: function () { return ask('crux:store:list', {}).then(function (r) { return r.keys || []; }); }
    };
  }
  window.crux.fn = function (name, body) {
    return ask('crux:fn:call', { name: name, body: body === undefined ? null : body }).then(function (r) {
      if (r.status >= 400) throw new Error((r.body && r.body.error) || ('Function ' + name + ' failed: ' + r.status));
      return r.body;
    });
  };
  window.crux.emit = function (name, data) {
    return ask('crux:fn:emit', { name: name, data: data === undefined ? null : data }).then(function (r) {
      if (r.refused) throw new Error(r.refused.message);
      return { event: r.event, handlers: r.handlers };
    });
  };
  var listening = false;
  window.crux.on = function (name, cb) {
    if (!framed) return function () {};
    if (!listening) { listening = true; window.parent.postMessage({ type: 'crux:fn:on' }, '*'); }
    function hear(e) {
      if (!e.data || e.data.type !== 'crux:fn:event' || !e.data.event) return;
      var ev = e.data.event;
      if (name === '*' || ev.name === name) cb(ev.data, ev);
    }
    window.addEventListener('message', hear);
    return function () { window.removeEventListener('message', hear); };
  };
  if (framed) window.parent.postMessage({ type: 'crux:ready' }, '*');
})();
`;

/** Write `crux.js` into the crux unless it is already there; returns whether it was written. */
export async function writeClientFile(cruxId: string): Promise<boolean> {
  const { artifact } = getServices();
  const existing = await artifact.findByResource('crux', cruxId);
  if (existing.some((a) => a.type === 'artifact' && pathOf(a) === CLIENT_PATH)) return false;
  await artifact.create({
    resourceId: cruxId,
    resourceType: 'crux',
    content: CLIENT_SOURCE,
    mimeType: 'text/javascript',
    meta: { path: CLIENT_PATH },
  });
  return true;
}

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
  await writeClientFile(cruxId);
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
