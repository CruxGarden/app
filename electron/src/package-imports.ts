import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export const PACKAGE_EXTENSIONS = /\.(crux|cruxtool|cruxmood)$/i;
const MAX_BYTES = 500 * 1024 * 1024;

/** OS-selected files are capabilities. Renderer callers can use an opaque queue
 * ID; they cannot turn this bridge into an arbitrary filesystem reader. */
export class PackageImports {
  private readonly queue = new Map<string, { path: string; name: string }>();
  constructor(private readonly changed: () => void) {}

  add(paths: string[], cwd = process.cwd()) {
    for (const candidate of paths) {
      if (candidate.startsWith('-') || !PACKAGE_EXTENSIONS.test(candidate)) continue;
      const path = resolve(cwd, candidate);
      const key = (value: string) => (process.platform === 'win32' ? value.toLowerCase() : value);
      if ([...this.queue.values()].some((item) => key(item.path) === key(path))) continue;
      if (this.queue.size >= 16) break;
      this.queue.set(randomUUID(), { path, name: basename(path) });
    }
    this.changed();
  }
  pending() {
    return [...this.queue].map(([id, item]) => ({ id, name: item.name }));
  }
  dismiss(id: string) {
    this.queue.delete(id);
    this.changed();
  }
  async read(id: string): Promise<Uint8Array> {
    const item = this.queue.get(id);
    if (!item)
      throw new Error('This file-open request is no longer available. Open the file again.');
    const file = await open(item.path, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new Error('Choose a package file smaller than 500 MB.');
      // Read through the checked handle with a bound even if another writer grows it.
      const chunks: Buffer[] = [];
      let received = 0;
      for await (const chunk of file.createReadStream({
        autoClose: false,
        highWaterMark: 1024 * 1024,
      })) {
        received += chunk.length;
        if (received > MAX_BYTES) throw new Error('This package exceeds the 500 MB limit.');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } finally {
      await file.close();
    }
  }
}
