import type { Artifact } from '@/api/types';
import { getServices } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import {
  egressAllowed,
  egressHosts,
  functionFiles,
  localSecrets,
  type CallResult,
} from './crux-functions';

function findArtifactByPath(artifacts: Artifact[], path: string): Artifact | null {
  const normalized = path.replace(/^\//, '');
  return artifacts.find((a) => a.type === 'artifact' && pathOf(a) === normalized) ?? null;
}

/**
 * Crux Functions in the workspace (CRUX-FUNCTIONS-PLAN, the preview runner):
 * the same handlers the API runs where the crux is shared, run here against
 * the local Store, so a page in the Workshop can call `crux.fn` and hear
 * `crux.on` before anything is published. A handler runs in a bare Web
 * Worker — no DOM, no network (fetch and friends removed), no importScripts —
 * with the same `ctx` the API gives it; Store calls are bridged to the local
 * Store service. Five seconds, then the worker is terminated.
 */
const WALL_MS = 5000;
const MAX_DEPTH = 4;

/** ESM → CommonJS, exactly as the API's runner does it. */
export function compileToCjs(code: string): string {
  return code
    .replace(/export\s+default\s+async\s+function/g, 'module.exports.default = async function')
    .replace(/export\s+default\s+function/g, 'module.exports.default = function')
    .replace(/export\s+default\s+/g, 'module.exports.default = ')
    .replace(/export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g, '$1 $2 = module.exports.$2 =');
}

/** `score*` matches `score:saved`; `*` matches anything; otherwise exact. */
export function matches(pattern: string, name: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  return pattern === name;
}

const WORKER_PRELUDE = `
  self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined;
  self.importScripts = undefined; self.EventSource = undefined; self.navigator = undefined;
  const pending = new Map(); let seq = 0;
  function ask(op, payload) {
    return new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      self.postMessage({ op, id, ...payload });
    });
  }
  const logs = [];
  self.onmessage = async (e) => {
    const m = e.data;
    if (m.op === 'answer') { const p = pending.get(m.id); pending.delete(m.id); if (!p) return; m.error ? p.reject(new Error(m.error)) : p.resolve(m.value); return; }
    if (m.op !== 'run') return;
    const module = { exports: {} };
    class FunctionReject extends Error { constructor(message, status) { super(message); this.status = status || 400; } }
    const secrets = m.secrets || {};
    const ctx = Object.freeze({
      crux: { id: m.cruxId },
      visitor: m.visitorId ? { id: m.visitorId, isOwner: m.visitorId === m.ownerId } : null,
      owner: { id: m.ownerId },
      secrets: Object.freeze({
        get: (name) => (Object.prototype.hasOwnProperty.call(secrets, String(name)) ? secrets[String(name)] : null),
        has: (name) => Object.prototype.hasOwnProperty.call(secrets, String(name)),
      }),
      fetch: (url, init) => ask('fetch', { url: String(url), init: init || {} }).then((r) => ({
        ok: r.ok, status: r.status, headers: r.headers,
        text: async () => r.text, json: async () => JSON.parse(r.text),
      })),
      event: m.event ?? null,
      now: () => new Date().toISOString(),
      log: (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); },
      json: (value, status) => ({ __json: value, __status: status || 200 }),
      text: (body, status, type) => ({ __text: String(body == null ? '' : body), __status: status || 200, __type: type || 'text/plain; charset=utf-8' }),
      html: (body, status) => ({ __text: String(body == null ? '' : body), __status: status || 200, __type: 'text/html; charset=utf-8' }),
      redirect: (url, status) => ({ __text: '', __status: status || 302, __headers: { Location: String(url) } }),
      reject: (message, status) => { throw new FunctionReject(message, status); },
      emit: (name, data) => ask('emit', { name, data }),
      store: Object.freeze({
        get: (key) => ask('store', { method: 'get', args: [key] }),
        set: (key, value, mode) => ask('store', { method: 'set', args: [key, value, mode] }),
        increment: (key, by, mode) => ask('store', { method: 'increment', args: [key, by, mode] }),
        list: (prefix) => ask('store', { method: 'list', args: [prefix || ''] }),
        del: (key) => ask('store', { method: 'delete', args: [key] }),
      }),
    });
    const req = Object.freeze({
      method: m.method || 'POST', body: m.body ?? null,
      json: async () => m.body ?? null, text: async () => (m.body == null ? '' : typeof m.body === 'string' ? m.body : JSON.stringify(m.body)),
      headers: {}, query: m.query || {}, path: m.rest || '', params: String(m.rest || '').split('/').filter(Boolean),
    });
    try {
      new Function('module', 'exports', m.code)(module, module.exports);
      const fn = module.exports.default;
      if (typeof fn !== 'function') throw new Error('functions/' + m.name + '.js has no default export function');
      const out = await fn(req, ctx);
      const status = out && typeof out === 'object' && '__status' in out ? out.__status : 200;
      const body = out && typeof out === 'object' && '__text' in out ? out.__text : out && typeof out === 'object' && '__json' in out ? out.__json : (out ?? null);
      self.postMessage({ op: 'done', status, body, logs });
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      self.postMessage({ op: 'done', status, body: { error: String(err && err.message || err) }, logs });
    }
  };
`;

export interface LocalRunInput {
  body?: unknown;
  event?: { name: string; data: unknown; at: string } | null;
  visitorId?: string | null;
  depth?: number;
}

async function loadSource(cruxId: string, path: string): Promise<string | null> {
  const { artifact } = getServices();
  const artifacts = await artifact.findByResource('crux', cruxId);
  const match = findArtifactByPath(artifacts, path);
  if (!match) return null;
  const blob = await artifact.downloadBlob(match.id);
  return blob.text();
}

/** Run one handler file locally. */
export async function runLocalHandler(
  cruxId: string,
  name: string,
  code: string,
  input: LocalRunInput,
): Promise<CallResult> {
  const started = Date.now();
  const { store } = getServices();
  const egress = /ctx\.fetch/.test(code) ? await egressHosts(cruxId) : [];
  const secrets = /ctx\.secrets/.test(code) ? localSecrets(cruxId) : {};
  const url = URL.createObjectURL(new Blob([WORKER_PRELUDE], { type: 'text/javascript' }));
  const worker = new Worker(url);
  const visitorId = input.visitorId ?? null;
  const depth = input.depth ?? 0;
  try {
    return await new Promise<CallResult>((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate();
        resolve({
          status: 504,
          body: { error: `functions/${name}.js ran past ${WALL_MS / 1000}s` },
          ms: Date.now() - started,
          logs: [],
        });
      }, WALL_MS);
      worker.onmessage = async (e: MessageEvent) => {
        const m = e.data as Record<string, unknown>;
        if (m.op === 'done') {
          clearTimeout(timer);
          resolve({
            status: m.status as number,
            body: m.body,
            ms: Date.now() - started,
            logs: (m.logs as string[]) ?? [],
          });
          return;
        }
        if (m.op === 'store') {
          const args = m.args as unknown[];
          try {
            let value: unknown = null;
            switch (m.method) {
              case 'get':
                value = await store.get(cruxId, args[0] as string, visitorId);
                break;
              case 'set':
                await store.set(
                  cruxId,
                  args[0] as string,
                  args[1],
                  ((args[2] as string) ?? 'public') as 'public' | 'protected',
                  visitorId,
                );
                value = { key: args[0], mode: args[2] ?? 'public' };
                break;
              case 'increment':
                value = await store.increment(
                  cruxId,
                  args[0] as string,
                  Number(args[1]) || 1,
                  visitorId,
                );
                break;
              case 'list':
                value = (await store.list(cruxId))
                  .filter((e) => e.key.startsWith(String(args[0] ?? '')))
                  .map((e) => ({ key: e.key, value: e.value, mode: e.mode }));
                break;
              case 'delete':
                await store.delete(cruxId, args[0] as string, visitorId);
                break;
            }
            worker.postMessage({ op: 'answer', id: m.id, value });
          } catch (err) {
            worker.postMessage({ op: 'answer', id: m.id, error: (err as Error).message });
          }
          return;
        }
        if (m.op === 'fetch') {
          try {
            const target = new URL(String(m.url));
            if (target.protocol !== 'http:' && target.protocol !== 'https:')
              throw new Error('fetch: only http and https');
            if (!egressAllowed(target.hostname, egress))
              throw new Error(
                `fetch: ${target.hostname} is not in functions/egress.json ("hosts")`,
              );
            const init = (m.init ?? {}) as Record<string, unknown>;
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries((init.headers as Record<string, unknown>) ?? {}))
              headers[k] = String(v);
            const body =
              init.body === undefined || init.body === null
                ? undefined
                : typeof init.body === 'string'
                  ? init.body
                  : JSON.stringify(init.body);
            if (
              body !== undefined &&
              !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
            )
              headers['content-type'] = 'application/json';
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 4000);
            const res = await fetch(target, {
              method: String(init.method ?? 'GET').toUpperCase(),
              headers,
              body,
              signal: ctl.signal,
            }).finally(() => clearTimeout(t));
            const text = await res.text();
            const outHeaders: Record<string, string> = {};
            res.headers.forEach((v, k) => {
              outHeaders[k] = v;
            });
            worker.postMessage({
              op: 'answer',
              id: m.id,
              value: { ok: res.ok, status: res.status, headers: outHeaders, text },
            });
          } catch (err) {
            worker.postMessage({ op: 'answer', id: m.id, error: (err as Error).message });
          }
          return;
        }
        if (m.op === 'emit') {
          try {
            const r = await emitLocal(cruxId, m.name as string, m.data, visitorId, depth + 1);
            worker.postMessage({ op: 'answer', id: m.id, value: { handlers: r.handlers } });
          } catch (err) {
            worker.postMessage({ op: 'answer', id: m.id, error: (err as Error).message });
          }
        }
      };
      worker.onerror = (ev) => {
        clearTimeout(timer);
        resolve({
          status: 500,
          body: { error: ev.message || 'handler failed' },
          ms: Date.now() - started,
          logs: [],
        });
      };
      worker.postMessage({
        op: 'run',
        name,
        code: compileToCjs(code),
        body: input.body ?? null,
        event: input.event ?? null,
        visitorId,
        // In the workspace the one visitor is the author: the owner.
        ownerId: visitorId,
        cruxId,
        secrets,
      });
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

/** `crux.fn(name, body)` in the workspace: run `functions/<name>.js` locally. */
export async function callLocalFunction(
  cruxId: string,
  name: string,
  body: unknown,
  visitorId: string | null = null,
): Promise<CallResult> {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('on-'))
    return { status: 404, body: { error: `No function "${name}"` }, ms: 0, logs: [] };
  const code = await loadSource(cruxId, `functions/${name}.js`);
  if (code === null)
    return { status: 404, body: { error: `No function "${name}"` }, ms: 0, logs: [] };
  return runLocalHandler(cruxId, name, code, { body, visitorId });
}

/** The exported `match` pattern of an event handler, without running it. */
function matchPattern(code: string): string | null {
  const m = /export\s+const\s+match\s*=\s*(['"`])([^'"`]+)\1/.exec(code);
  return m ? m[2]! : null;
}

export interface LocalEmitResult {
  event: string;
  handlers: number;
  results: Record<string, CallResult>;
  /** A handler refused (ctx.reject): the first refusal, for callers that can honour it. */
  refused: { handler: string; message: string; status: number } | null;
}

/** `crux.emit(name, data)` in the workspace: every matching `on-*` handler runs. */
export async function emitLocal(
  cruxId: string,
  name: string,
  data: unknown,
  visitorId: string | null = null,
  depth = 0,
): Promise<LocalEmitResult> {
  const out: LocalEmitResult = { event: name, handlers: 0, results: {}, refused: null };
  if (depth > MAX_DEPTH) return out;
  const { artifact } = getServices();
  const artifacts = await artifact.findByResource('crux', cruxId);
  const files = functionFiles(artifacts).filter((f) => f.kind === 'event');
  const event = { name, data, at: new Date().toISOString() };
  for (const f of files) {
    const a = findArtifactByPath(artifacts, f.path);
    if (!a) continue;
    const code = await (await artifact.downloadBlob(a.id)).text();
    const pattern = matchPattern(code) ?? f.event!;
    if (!matches(pattern, name)) continue;
    const r = await runLocalHandler(cruxId, f.name, code, { event, visitorId, depth });
    out.handlers += 1;
    out.results[f.name] = r;
    if (!out.refused && r.status >= 400 && r.status < 500 && r.body && typeof r.body === 'object')
      out.refused = {
        handler: f.name,
        message: String((r.body as { error?: unknown }).error ?? 'refused'),
        status: r.status,
      };
  }
  // Pages listening with crux.on hear it (the proxy forwards to frames).
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('crux:functions:event', { detail: { cruxId, event } }));
  return out;
}
