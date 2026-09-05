/**
 * The crux's own key-value store, as this page reaches it.
 *
 * A published crux carries a Crux Store (`window.crux.store`): keys in three
 * modes — `public` (anyone reads and writes), `protected` (one slot per
 * signed-in visitor, private to them), `common` (one value per key belonging
 * to the crux, readable by anyone, written only with a visitor's sign-in). The
 * board and the "played today" record live there, so a fork of this site
 * carries its own board and Crux Garden runs no other backend for it.
 *
 * Three ways in, tried in this order:
 *
 * 1. **The API, directly** — when the publish injection told the page which
 *    crux it is (`window.crux.publish`). The injected SDK takes its token only
 *    from an opener frame, so a page opened at its own URL has no way to hand
 *    it the visitor's sign-in; the page mirrors the SDK's requests itself
 *    (`GET/PUT /store/:cruxId/:key`) and attaches `Authorization: Bearer`
 *    when the visitor has signed in on this page.
 * 2. **The SDK** — `window.crux.store` where a host injected one and no
 *    publish facts are known (a static preview in the web app).
 * 3. **The host frame** — the workshop preview: astro dev serves the page
 *    verbatim, so this speaks the SDK's own `crux:store:*` postMessage
 *    protocol to the parent, which proxies to the author's local store.
 *
 * Nowhere (a local build opened on its own) → null, and the board stays quiet.
 * Plain `fetch`, no dependency — this file is written into the published site.
 */

export type StoreMode = 'public' | 'protected' | 'common';

export interface KeyStore {
  /** Which way in — for messages and tests, never for logic. */
  readonly via: 'api' | 'sdk' | 'host';
  /** The value, or null when there is none (or the visitor may not read it). */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, mode: StoreMode): Promise<void>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/** The slice of `window` this file touches — injectable for tests. */
export interface StoreWindow {
  crux?: {
    publish?: { cruxId?: string | null; apiBase?: string | null };
    store?: {
      get(key: string): Promise<unknown>;
      set(key: string, value: unknown, opts?: { mode?: string }): Promise<void>;
    };
  };
  parent?: { postMessage(message: unknown, targetOrigin: string): void } | null;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
  fetch?: typeof fetch;
}

/**
 * The store for this page, given the visitor's sign-in token (null when
 * signed out). Call it again after a sign-in — the token is baked in.
 */
export function storeFor(
  token: string | null,
  win: StoreWindow | undefined = globalThis.window as StoreWindow | undefined,
): KeyStore | null {
  if (!win) return null;
  const pub = win.crux?.publish;
  if (pub?.cruxId && pub.apiBase) {
    return apiStore(
      pub.apiBase.replace(/\/$/, ''),
      pub.cruxId,
      token,
      win.fetch ?? globalThis.fetch,
    );
  }
  if (win.crux?.store) return sdkStore(win.crux.store);
  if (win.parent && win.parent !== (win as unknown)) return hostStore(win);
  return null;
}

// ── 1. The API ──────────────────────────────────────────────────────────────

function apiStore(
  apiBase: string,
  cruxId: string,
  token: string | null,
  fetchFn: typeof fetch,
): KeyStore {
  const url = (key: string) =>
    `${apiBase}/store/${encodeURIComponent(cruxId)}/${encodeURIComponent(key)}`;
  const headers = (json: boolean): Record<string, string> => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };
  return {
    via: 'api',
    async get(key) {
      // As the SDK does: anything but a value reads as "nothing there".
      try {
        const res = await fetchFn(url(key), { headers: headers(false) });
        if (!res.ok) return null;
        const data = (await res.json()) as { value?: unknown } | null;
        return data?.value ?? null;
      } catch {
        return null;
      }
    },
    async set(key, value, mode) {
      const res = await fetchFn(url(key), {
        method: 'PUT',
        headers: headers(true),
        body: JSON.stringify({ value, mode }),
      });
      if (!res.ok) {
        throw new StoreError(
          res.status === 401
            ? 'Your sign-in has expired.'
            : `The store did not take that (${res.status}).`,
          res.status,
        );
      }
    },
  };
}

// ── 2. The SDK ──────────────────────────────────────────────────────────────

function sdkStore(sdk: NonNullable<NonNullable<StoreWindow['crux']>['store']>): KeyStore {
  return {
    via: 'sdk',
    get: (key) => sdk.get(key),
    set: (key, value, mode) => sdk.set(key, value, { mode }),
  };
}

// ── 3. The host frame ───────────────────────────────────────────────────────

/** Mirrors the SDK's local mode: a request id, a `:res` reply, five seconds, then null. */
function hostStore(win: StoreWindow): KeyStore {
  const parent = win.parent!;
  function call(type: string, payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => {
        win.removeEventListener('message', onReply);
        resolve(null);
      }, 5000);
      function onReply(e: MessageEvent) {
        const d = e.data as { type?: string; id?: string; value?: unknown } | null;
        if (!d || d.id !== id || d.type !== `${type}:res`) return;
        clearTimeout(timeout);
        win.removeEventListener('message', onReply);
        resolve(d.value === undefined ? null : d.value);
      }
      win.addEventListener('message', onReply);
      parent.postMessage({ type, id, ...payload }, '*');
    });
  }
  return {
    via: 'host',
    get: (key) => call('crux:store:get', { key }),
    async set(key, value, mode) {
      // Fire and forget, as the SDK does — the host has no reply for a write.
      parent.postMessage({ type: 'crux:store:set', key, value, mode }, '*');
    },
  };
}
