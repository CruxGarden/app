import { totalmem, platform, arch } from 'node:os';
import { execFile } from 'node:child_process';
import type { LocalModelHardware } from './bridge';

/** No shell, no telemetry. A missing GPU probe leaves an explicit unknown. */
export async function localModelHardware(): Promise<LocalModelHardware> {
  const unifiedMemory = platform() === 'darwin' && arch() === 'arm64';
  const gpuMemoryBytes = unifiedMemory
    ? null
    : await new Promise<number | null>((resolve) => {
        execFile(
          'nvidia-smi',
          ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
          { timeout: 2000, maxBuffer: 8192, windowsHide: true },
          (error, stdout) => {
            if (error) return resolve(null);
            const sizes = stdout
              .trim()
              .split(/\r?\n/)
              .map(Number)
              .filter((n) => Number.isFinite(n) && n > 0);
            resolve(sizes.length ? Math.max(...sizes) * 1024 ** 2 : null);
          },
        );
      });
  return { memoryBytes: totalmem(), unifiedMemory, gpuMemoryBytes };
}
