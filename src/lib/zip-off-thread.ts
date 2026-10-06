import type JSZip from 'jszip';
import type { ZipJob } from '@/workers/zip.worker';

/**
 * `zip.generateAsync`, but in a worker: the page keeps answering while a big
 * archive is packed, and the packing reports how far it has got (UX pass,
 * 2026-09-27: "nothing should freeze or block"). Falls back to the page's
 * thread where there are no workers (unit tests in Node).
 */
export async function generateZip(
  zip: JSZip,
  options: {
    compression?: 'STORE' | 'DEFLATE';
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Blob> {
  const compression = options.compression ?? 'STORE';
  const onThisThread = () =>
    zip.generateAsync({ type: 'blob', compression }, (meta) =>
      options.onProgress?.(Math.floor(meta.percent)),
    );
  if (typeof Worker === 'undefined') return onThisThread();
  const entries: ZipJob['entries'] = [];
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    entries.push({ path, data: await file.async('uint8array'), date: file.date?.getTime() });
    options.signal?.throwIfAborted();
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL('../workers/zip.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return onThisThread();
  }
  let started = false;
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(new DOMException('Packing was cancelled', 'AbortError'));
      options.signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = (
        event: MessageEvent<{ progress?: number; blob?: Blob; error?: string }>,
      ) => {
        const { progress, blob, error } = event.data;
        started = true;
        if (progress !== undefined) options.onProgress?.(progress);
        else if (blob) resolve(blob);
        else reject(new Error(error ?? 'Packing failed'));
      };
      worker.onerror = (event) =>
        reject(Object.assign(new Error(event.message || 'Packing failed'), { started }));
      worker.postMessage({ entries, compression } satisfies ZipJob);
    });
  } catch (error) {
    // A worker that could not even start (a scheme that will not load module
    // workers): pack on this thread rather than fail the export.
    if (!(error as { started?: boolean }).started && (error as Error).name !== 'AbortError')
      return onThisThread();
    throw error;
  } finally {
    worker.terminate();
  }
}
