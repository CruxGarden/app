import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NativeBlobStore } =
  require('../dist/native-blobs.js') as typeof import('../src/native-blobs');

test('content-addressed writes verify bytes and never replace an existing blob', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crux-blob-security-'));
  const bytes = Buffer.from('shared by two Growth snapshots');
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  const wrong = Buffer.from('wrong bytes');
  const store = new NativeBlobStore(dir);
  try {
    expect.soft(() => store.blobWrite(fingerprint, wrong)).toThrow(/fingerprint/i);
    expect.soft(store.blobExists(fingerprint)).toBe(false);
    store.blobWrite(fingerprint, bytes);
    const before = statSync(join(dir, fingerprint));
    store.blobWrite(fingerprint, bytes);
    const after = statSync(join(dir, fingerprint));
    expect.soft(after.ino).toBe(before.ino);
    expect.soft(after.mtimeMs).toBe(before.mtimeMs);
    expect.soft(() => store.blobWrite(fingerprint, wrong)).toThrow(/fingerprint/i);
    expect(Buffer.from(store.blobRead(fingerprint))).toEqual(bytes);
    expect(readFileSync(join(dir, fingerprint))).toEqual(bytes);
    expect(readdirSync(dir)).toEqual([fingerprint]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
