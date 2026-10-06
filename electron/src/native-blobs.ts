import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/** Shared filesystem content store; database ownership is supplied separately. */
export class NativeBlobStore {
  constructor(private readonly blobDir: string) {
    fs.mkdirSync(blobDir, { recursive: true });
  }

  // ── Blob storage (filesystem) ──────────────────────────────

  private blobPath(fingerprint: string): string {
    // Blob names are content fingerprints — SHA-256 hex, nothing else. Without
    // this check the renderer could pass '../…' and turn every blob operation
    // into arbitrary filesystem read/write/delete.
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new Error(`invalid blob fingerprint: ${String(fingerprint).slice(0, 32)}`);
    }
    return path.join(this.blobDir, fingerprint);
  }

  private prepareWrite(fingerprint: string, data: Uint8Array) {
    const destination = this.blobPath(fingerprint);
    const bytes = Buffer.from(data);
    if (createHash('sha256').update(bytes).digest('hex') !== fingerprint)
      throw new Error('Blob bytes do not match their fingerprint');
    if (fs.existsSync(destination)) return null;
    const staging = path.join(this.blobDir, `.${fingerprint}.${randomUUID()}.tmp`);
    return { destination, bytes, staging };
  }

  /** Keep durable flushing off the Electron main thread. The API awaits this
   * before admitting any manifest that references the new bytes. */
  async blobWriteAsync(fingerprint: string, data: Uint8Array): Promise<void> {
    const write = this.prepareWrite(fingerprint, data);
    if (!write) return;
    const { destination, bytes, staging } = write;
    try {
      await fs.promises.writeFile(staging, bytes, { flag: 'wx', mode: 0o600, flush: true });
      try {
        await fs.promises.link(staging, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      await fs.promises.rm(staging, { force: true }).catch(() => {});
    }
  }

  blobWrite(fingerprint: string, data: Uint8Array): void {
    const write = this.prepareWrite(fingerprint, data);
    if (!write) return;
    const { destination, bytes, staging } = write;
    try {
      // Never truncate a committed blob: snapshots and other Cruxes may share
      // it. A hard link admits the flushed bytes atomically without replacing
      // a blob another writer committed while this one was being staged.
      fs.writeFileSync(staging, bytes, { flag: 'wx', mode: 0o600, flush: true });
      try {
        fs.linkSync(staging, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      try {
        fs.rmSync(staging, { force: true });
      } catch {
        // An unreferenced temporary file is safer than masking a write failure.
      }
    }
  }

  blobRead(fingerprint: string): Uint8Array {
    const p = this.blobPath(fingerprint);
    if (!fs.existsSync(p)) throw new Error(`Blob not found: ${fingerprint}`);
    return new Uint8Array(fs.readFileSync(p));
  }

  blobDelete(fingerprint: string): void {
    const p = this.blobPath(fingerprint);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  blobExists(fingerprint: string): boolean {
    return fs.existsSync(this.blobPath(fingerprint));
  }

  blobWipeAll(): void {
    const files = fs.readdirSync(this.blobDir);
    for (const file of files) {
      fs.unlinkSync(path.join(this.blobDir, file));
    }
  }
}
