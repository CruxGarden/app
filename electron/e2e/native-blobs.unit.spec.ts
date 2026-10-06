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

test('async durable writes leave the event loop available and admit shared bytes once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crux-blob-async-'));
  const store = new NativeBlobStore(dir);
  const bytes = Buffer.from('shared async content');
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  try {
    const writes = Promise.all([
      store.blobWriteAsync(fingerprint, bytes),
      store.blobWriteAsync(fingerprint, bytes),
    ]);
    let done = false;
    void writes.then(() => {
      done = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(done).toBe(false);
    await writes;
    expect(Buffer.from(store.blobRead(fingerprint))).toEqual(bytes);
    const inode = statSync(join(dir, fingerprint)).ino;
    await store.blobWriteAsync(fingerprint, bytes);
    expect(statSync(join(dir, fingerprint)).ino).toBe(inode);
    await expect(store.blobWriteAsync(fingerprint, Buffer.from('wrong'))).rejects.toThrow(
      'fingerprint',
    );
    expect(readdirSync(dir)).toEqual([fingerprint]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
