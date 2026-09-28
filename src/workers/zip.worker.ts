/// <reference lib="webworker" />
import JSZip from 'jszip';

/**
 * Packs an archive off the page's thread: the checksum and assembly of a
 * 150 MB archive used to hold the app still for seconds (lib/zip-off-thread).
 */
export interface ZipJob {
  entries: { path: string; data: Uint8Array; date?: number }[];
  compression: 'STORE' | 'DEFLATE';
}

self.onmessage = async (event: MessageEvent<ZipJob>) => {
  const { entries, compression } = event.data;
  try {
    const zip = new JSZip();
    for (const entry of entries)
      zip.file(entry.path, entry.data, {
        binary: true,
        ...(entry.date ? { date: new Date(entry.date) } : {}),
      });
    let last = -1;
    const blob = await zip.generateAsync({ type: 'blob', compression }, (meta) => {
      const percent = Math.floor(meta.percent);
      if (percent !== last) {
        last = percent;
        self.postMessage({ progress: percent });
      }
    });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
