import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

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

  blobWrite(fingerprint: string, data: Uint8Array): void {
    const destination = this.blobPath(fingerprint);
    const staging = path.join(this.blobDir, `.${fingerprint}.${randomUUID()}.tmp`);
    try {
      // Never truncate a committed blob: snapshots and other Cruxes may share
      // it. Flush a complete sibling file before the atomic rename commits it.
      fs.writeFileSync(staging, Buffer.from(data), { flag: 'wx', mode: 0o600, flush: true });
      fs.renameSync(staging, destination);
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
