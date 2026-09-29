import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { listenForPublishedCalls } from './published-relay';

const state = vi.hoisted(() => ({ revision: 1, signedIn: true, exchange: vi.fn() }));
vi.mock('@/api/client', () => ({ default: { post: state.exchange } }));
vi.mock('@/api/session', () => ({
  captureAuth: () => ({ endpoint: 'https://api.example', revision: state.revision }),
  getStoredTokens: async () => ({ accessToken: state.signedIn ? 'private-account-token' : null }),
  assertAuthCurrent: (context: { revision: number }) => {
    if (context.revision !== state.revision) throw new Error('Account changed');
  },
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: { getState: () => ({ author: { id: 'reader' } }) },
}));
vi.mock('@/api/authors', () => ({ searchAuthors: vi.fn(async () => []) }));
let handlers: Set<(e: MessageEvent) => void>;
let fetch: ReturnType<typeof vi.fn>;
const origin = 'https://one.publish.crux.garden';
const event = (source: unknown, type: string, extra = {}, from = origin) => {
  for (const handler of handlers)
    handler({
      source,
      origin: from,
      data: { type, id: 'request-1', key: 'note', ...extra },
    } as MessageEvent);
};
beforeEach(() => {
  state.revision = 1;
  state.signedIn = true;
  state.exchange
    .mockReset()
    .mockResolvedValue({ data: { accessToken: 'pv_scoped', expiresIn: 900 } });
  handlers = new Set();
  vi.stubGlobal('window', {
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => handlers.add(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => handlers.delete(fn),
  });
  fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ value: 17 }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetch);
});
afterEach(() => vi.unstubAllGlobals());

it('requires both exact frame and origin and forwards only a scoped credential for its own Crux', async () => {
  const frame = { postMessage: vi.fn() };
  const stop = listenForPublishedCalls('one', origin, () => frame as unknown as Window);
  event({}, 'crux:store:get');
  event(frame, 'crux:store:get', {}, 'https://evil.example');
  expect(state.exchange).not.toHaveBeenCalled();
  event(frame, 'crux:store:get', { cruxId: 'another', apiBase: 'https://evil.example' });
  await vi.waitFor(() => expect(frame.postMessage).toHaveBeenCalled());
  expect(state.exchange.mock.calls[0]!.slice(0, 2)).toEqual([
    '/published-auth/one/session',
    { origin },
  ]);
  expect(fetch.mock.calls[0]).toEqual([
    'https://api.example/store/one/note',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer pv_scoped' }),
    }),
  ]);
  expect(JSON.stringify(frame.postMessage.mock.calls)).not.toContain('token');
  expect(frame.postMessage).toHaveBeenCalledWith(
    { type: 'crux:store:get:res', id: 'request-1', value: 17 },
    origin,
  );
  stop();
  expect(handlers.size).toBe(0);
});

it('refuses owner listing and reports write refusal instead of acknowledging success', async () => {
  const frame = { postMessage: vi.fn() };
  listenForPublishedCalls('one', origin, () => frame as unknown as Window);
  event(frame, 'crux:store:list');
  expect(fetch).not.toHaveBeenCalled();
  expect(frame.postMessage.mock.calls[0]![0].error).toMatch(/authoring/);
  fetch.mockResolvedValueOnce(new Response(null, { status: 429 }));
  event(frame, 'crux:store:set', { value: 'draft' });
  await vi.waitFor(() => expect(frame.postMessage).toHaveBeenCalledTimes(2));
  expect(frame.postMessage.mock.calls[1]![0].error).toContain('429');
});

it('drops cached visitor authority after parent logout and never replies to a replaced frame', async () => {
  const first = { postMessage: vi.fn() },
    second = { postMessage: vi.fn() };
  let frame = first;
  listenForPublishedCalls('one', origin, () => frame as unknown as Window);
  event(first, 'crux:store:get');
  await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledTimes(1));
  state.signedIn = false;
  state.revision++;
  event(first, 'crux:store:get');
  await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1]![1].headers).not.toHaveProperty('Authorization');
  let release!: (response: Response) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  event(first, 'crux:store:get');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  frame = second;
  release(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(first.postMessage).toHaveBeenCalledTimes(2);
  expect(second.postMessage).not.toHaveBeenCalled();
});
