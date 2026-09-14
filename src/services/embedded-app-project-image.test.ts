import { afterEach, expect, it, vi } from 'vitest';
import {
  loadProjectImage,
  validateProjectImagePath,
} from '../../embedded-apps/shared/project-image.js';

afterEach(() => vi.unstubAllGlobals());
it('accepts project images while rejecting traversal, remote and encoded paths', () => {
  expect(validateProjectImagePath('assets/My flower.png')).toBe('assets/My flower.png');
  expect(validateProjectImagePath(`data/assets/${'a'.repeat(64)}.bin`)).toContain('.bin');
  for (const path of [
    '../photo.png',
    '/photo.png',
    'http://other.test/photo.png',
    'a/%2e%2e/photo.png',
    'a\\photo.png',
    'photo.png?x=1',
    'data:image/png;base64,abc',
    'data/other.bin',
  ])
    expect(() => validateProjectImagePath(path)).toThrow();
});
it('fetches only the supplied project base, disallows redirects and releases decoded resources', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
    );
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 100;
      naturalHeight = 80;
      async decode() {}
    },
  );
  const result = await loadProjectImage('assets/My flower.png', 'http://localhost:4567/');
  expect(fetcher.mock.calls[0]?.[0].href).toBe('http://localhost:4567/assets/My%20flower.png');
  expect(fetcher.mock.calls[0]?.[1]).toEqual({ redirect: 'error' });
  expect(result.image.naturalWidth).toBe(100);
  result.release();
});
it('cancels an oversized stream before creating a decoded image', async () => {
  let cancelled = false;
  const chunk = new Uint8Array(1_000_000);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    ),
  );
  await expect(loadProjectImage('photo.png', 'http://localhost:4567/')).rejects.toThrow('32 MB');
  expect(cancelled).toBe(true);
});
