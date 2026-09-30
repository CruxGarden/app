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
