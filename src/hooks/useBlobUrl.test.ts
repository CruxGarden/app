import { afterEach, expect, it, vi } from 'vitest';

// Exercise the hook's effect lifecycle without a DOM. React owns when these
// callbacks run; the hook owns every URL produced between setup and cleanup.
const lifecycle = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock('react', () => ({
  useState: () => [null, vi.fn()],
  useEffect: (setup: () => (() => void) | undefined) => {
    lifecycle.cleanup = setup();
  },
}));
vi.mock('@/services/blobs', () => ({ blobObjectUrl: vi.fn() }));
import { useObjectUrl } from './useBlobUrl';

afterEach(() => {
  lifecycle.cleanup?.();
  vi.restoreAllMocks();
});

it.each(['blob:late', new Blob(['late'])])(
  'releases an owned result arriving after unmount: %s',
  async (result) => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:created');
    let finish!: (value: Blob | string) => void;
    useObjectUrl(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      [],
    );
    lifecycle.cleanup?.();
    finish(result);
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith(typeof result === 'string' ? result : 'blob:created');
  },
);

it('releases an accepted service URL when the effect is replaced', async () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  useObjectUrl(async () => 'blob:shown', []);
  await Promise.resolve();
  expect(revoke).not.toHaveBeenCalled();
  lifecycle.cleanup?.();
  expect(revoke).toHaveBeenCalledWith('blob:shown');
});
