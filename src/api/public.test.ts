import { afterEach, expect, it, vi } from 'vitest';
import { getAuthor, getCruxBySlug, PublicApiError } from './public';
vi.mock('./client', () => ({ apiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());
it('distinguishes missing content from server failures and encodes path segments', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  await expect(getCruxBySlug('@a/b', 'c/d')).rejects.toMatchObject({ status: 503 });
  expect(fetch.mock.calls[0]![0]).toBe('https://api.example.test/authors/a%2Fb/cruxes/c%2Fd');
  fetch.mockResolvedValue(new Response('{}', { status: 404 }));
  await expect(getAuthor('absent')).rejects.toBeInstanceOf(PublicApiError);
});
it('propagates caller cancellation to the request', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  await getAuthor('a', controller.signal);
  const signal = fetch.mock.calls[0]![1].signal;
  expect(signal.aborted).toBe(false);
  controller.abort();
  expect(signal.aborted).toBe(true);
});
it('reports streamed byte progress and returns complete bytes', async () => {
  const { downloadArtifact } = await import('./public');
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([1, 2]));
      c.enqueue(new Uint8Array([3]));
      c.close();
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-length': '3' } })),
  );
  const progress = vi.fn();
  const blob = await downloadArtifact('a', 'b', 'c', undefined, progress);
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(progress.mock.calls.map(([p]) => p.received)).toEqual([0, 2, 3]);
  expect(progress).toHaveBeenLastCalledWith({ received: 3, total: 3 });
});
it('refuses truncated downloads and allows an ordinary retry', async () => {
  const { downloadArtifact } = await import('./public');
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('ab', { headers: { 'content-length': '3' } }))
    .mockResolvedValueOnce(new Response('abc', { headers: { 'content-length': '3' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(downloadArtifact('a', 'b', 'c')).rejects.toThrow('incomplete');
  expect(await (await downloadArtifact('a', 'b', 'c')).text()).toBe('abc');
});
it('cancels an active stream instead of returning partial bytes', async () => {
  const { downloadArtifact } = await import('./public');
  const controller = new AbortController();
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1]));
          },
          cancel,
        }),
      ),
    ),
  );
  await expect(
    downloadArtifact('a', 'b', 'c', controller.signal, (p) => {
      if (p.received) controller.abort();
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancel).toHaveBeenCalledOnce();
});
it('allows a download longer than metadata timeout but aborts a stalled stream', async () => {
  const { downloadArtifact } = await import('./public');
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      signal = options.signal;
      return new Response(
        new ReadableStream({
          start(c) {
            signal!.addEventListener('abort', () => c.error(signal!.reason));
          },
        }),
      );
    }),
  );
  try {
    const result = downloadArtifact('a', 'b', 'c');
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(21_000);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
