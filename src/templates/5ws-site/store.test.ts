import { describe, it, expect, vi } from 'vitest';
import { storeFor, StoreError, type StoreWindow } from './src/lib/store';

type Listener = (e: MessageEvent) => void;

/** A window with just what the store touches; `frame` puts a parent behind it. */
function fakeWindow(opts: {
  publish?: { cruxId?: string | null; apiBase?: string | null };
  sdk?: NonNullable<StoreWindow['crux']>['store'];
  framed?: boolean;
  fetch?: typeof fetch;
}) {
  const listeners = new Set<Listener>();
  const posted: Array<{ message: unknown; target: string }> = [];
  const win: StoreWindow & { deliver(data: unknown): void } = {
    crux: { publish: opts.publish, store: opts.sdk },
    parent: null,
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
    fetch: opts.fetch,
    deliver(data) {
      for (const l of [...listeners]) l({ data } as MessageEvent);
    },
  };
  win.parent = opts.framed
    ? { postMessage: (message, target) => void posted.push({ message, target }) }
    : (win as unknown as StoreWindow['parent']);
  return { win, posted };
}

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('storeFor: which way in', () => {
  it('nowhere: no publish facts, no SDK, not framed → null', () => {
    expect(storeFor(null, fakeWindow({}).win)).toBeNull();
    expect(storeFor(null, undefined)).toBeNull();
  });

  it('published → the API directly, mirroring the SDK’s requests, with the sign-in as a bearer', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') return ok({ value: JSON.parse(String(init.body)).value });
      return ok({ value: { entries: [] } });
    });
    const { win } = fakeWindow({
      publish: { cruxId: 'crux-1', apiBase: 'https://api.example/' },
      fetch: fetchFn as unknown as typeof fetch,
    });
    const store = storeFor('tok', win)!;
    expect(store.via).toBe('api');

    expect(await store.get('leaderboard:2026-09-05')).toEqual({ entries: [] });
    await store.set('leaderboard:2026-09-05', { entries: [{ name: 'ada' }] }, 'public');

    const calls = fetchFn.mock.calls as unknown as Array<[string, RequestInit]>;
    const getCall = calls[0]!;
    const putCall = calls[1]!;
    expect(getCall[0]).toBe('https://api.example/store/crux-1/leaderboard%3A2026-09-05');
    expect((getCall[1].headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(putCall[0]).toBe('https://api.example/store/crux-1/leaderboard%3A2026-09-05');
    expect(putCall[1].method).toBe('PUT');
    expect(JSON.parse(String(putCall[1].body))).toEqual({
      value: { entries: [{ name: 'ada' }] },
      mode: 'public',
    });
    expect((putCall[1].headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect((putCall[1].headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('signed out, the API is asked without a bearer; a failed read is null; a refused write throws', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method === 'PUT' ? ok({ message: 'Unauthorized' }, 401) : ok({ message: 'nope' }, 500),
    );
    const { win } = fakeWindow({
      publish: { cruxId: 'crux-1', apiBase: 'https://api.example' },
      fetch: fetchFn as unknown as typeof fetch,
    });
    const store = storeFor(null, win)!;
    expect(await store.get('played:2026-09-05')).toBeNull();
    expect((fetchFn.mock.calls[0]![1] as RequestInit).headers).not.toHaveProperty('Authorization');
    const err = await store.set('played:2026-09-05', { entry: 'x' }, 'protected').catch((e) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect((err as StoreError).status).toBe(401);
    expect((err as StoreError).message).toBe('Your sign-in has expired.');
  });

  it('a network failure reads as null too', async () => {
    const { win } = fakeWindow({
      publish: { cruxId: 'crux-1', apiBase: 'https://api.example' },
      fetch: (async () => {
        throw new TypeError('offline');
      }) as unknown as typeof fetch,
    });
    expect(await storeFor(null, win)!.get('k')).toBeNull();
  });

  it('an injected SDK with no publish facts → the SDK, mode passed through', async () => {
    const sdk = { get: vi.fn(async () => 42), set: vi.fn(async () => {}) };
    const store = storeFor(null, fakeWindow({ sdk }).win)!;
    expect(store.via).toBe('sdk');
    expect(await store.get('k')).toBe(42);
    await store.set('k', 1, 'public');
    expect(sdk.set).toHaveBeenCalledWith('k', 1, { mode: 'public' });
  });

  it('publish facts win over an injected SDK — one identity per page', () => {
    const sdk = { get: vi.fn(async () => null), set: vi.fn(async () => {}) };
    const { win } = fakeWindow({
      publish: { cruxId: 'crux-1', apiBase: 'https://api.example' },
      sdk,
      fetch: (async () => ok({ value: null })) as unknown as typeof fetch,
    });
    expect(storeFor('tok', win)!.via).toBe('api');
  });

  it('framed with nothing injected → the host frame, speaking the SDK’s crux:store protocol', async () => {
    const { win, posted } = fakeWindow({ framed: true });
    const store = storeFor(null, win)!;
    expect(store.via).toBe('host');

    const pending = store.get('leaderboard:2026-09-05');
    expect(posted).toHaveLength(1);
    const req = posted[0]!.message as { type: string; id: string; key: string };
    expect(req).toMatchObject({ type: 'crux:store:get', key: 'leaderboard:2026-09-05' });
    expect(posted[0]!.target).toBe('*');
    win.deliver({ type: 'crux:store:get:res', id: 'someone-else', value: 'not mine' });
    win.deliver({ type: 'crux:store:get:res', id: req.id, value: { entries: [] } });
    expect(await pending).toEqual({ entries: [] });

    await store.set('played:2026-09-05', { entry: 'x' }, 'protected');
    expect(posted[1]!.message).toEqual({
      type: 'crux:store:set',
      key: 'played:2026-09-05',
      value: { entry: 'x' },
      mode: 'protected',
    });
  });

  it('a host that never answers reads as null after the SDK’s five seconds', async () => {
    vi.useFakeTimers();
    try {
      const { win } = fakeWindow({ framed: true });
      const pending = storeFor(null, win)!.get('k');
      await vi.advanceTimersByTimeAsync(5001);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
