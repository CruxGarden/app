import { afterEach, expect, it, vi } from 'vitest';
import type { FfmpegBridge } from '@/lib/platform';
import { transcode } from './media';

vi.mock('@/lib/platform', () => ({ Capability: { Transcode: 'transcode' }, can: () => true }));
afterEach(() => vi.unstubAllGlobals());

it('concurrent imports receive only their own progress and release subscriptions on success or refusal', async () => {
  const listeners = new Set<Parameters<FfmpegBridge['onProgress']>[0]>();
  const requests: Array<{ id: string; resolve: () => void; reject: () => void }> = [];
  const api: FfmpegBridge = {
    available: async () => true,
    onProgress: (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    transcode: (input) =>
      new Promise((resolve, reject) => {
        requests.push({
          id: input.requestId,
          resolve: () => resolve([]),
          reject: () => reject(new Error('conversion refused')),
        });
      }),
  };
  vi.stubGlobal('window', { electronAPI: { ffmpeg: api } });
  const input = { inputData: new Uint8Array([1]), inputName: 'song.wav', isAudio: true };
  const firstProgress = vi.fn();
  const secondProgress = vi.fn();
  const first = transcode(input, firstProgress);
  const second = transcode(input, secondProgress);
  expect(requests[0]!.id).not.toBe(requests[1]!.id);
  for (const listener of listeners) listener({ requestId: requests[1]!.id, progress: 0.65 });
  expect(firstProgress).not.toHaveBeenCalled();
  expect(secondProgress).toHaveBeenCalledExactlyOnceWith(0.65);
  requests[0]!.resolve();
  await first;
  expect(listeners.size).toBe(1);
  for (const listener of listeners) listener({ requestId: requests[0]!.id, progress: 1 });
  expect(secondProgress).toHaveBeenCalledTimes(1);
  const refused = expect(second).rejects.toThrow('conversion refused');
  requests[1]!.reject();
  await refused;
  expect(listeners.size).toBe(0);
});
