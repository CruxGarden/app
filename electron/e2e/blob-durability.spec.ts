import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('partial blob writes and failed replacements preserve the committed bytes', async () => {
  const { app } = await launchApp();
  try {
    const result = await app.evaluate(({ app }) => {
      const fs = process.getBuiltinModule('fs') as typeof import('node:fs');
      const path = process.getBuiltinModule('path') as typeof import('node:path');
      const { createHash } = process.getBuiltinModule('crypto') as typeof import('node:crypto');
      const nativeRequire = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = nativeRequire('./dist/sqlite-native.js');
      const root = path.join(app.getPath('userData'), 'blob-durability-fixture');
      const blobDir = path.join(root, 'blobs');
      const db = new SqliteNative(path.join(root, 'fixture.sqlite'), blobDir);
      const bytes = Buffer.from('Committed content must survive an incomplete rewrite');
      const fingerprint = createHash('sha256').update(bytes).digest('hex');
      const write = fs.writeFileSync;
      const rename = fs.renameSync;
      const failures: { kind: string; error: string; content: string; files: string[] }[] = [];
      try {
        db.blobWrite(fingerprint, bytes);
        for (const kind of ['partial-write', 'rename']) {
          let error = '';
          if (kind === 'partial-write') {
            fs.writeFileSync = ((file, data, options) => {
              if (typeof file === 'string' && path.dirname(file) === blobDir) {
                write(file, Buffer.from(data as Uint8Array).subarray(0, 7), options);
                throw new Error('Injected partial write');
              }
              return write(file, data, options);
            }) as typeof fs.writeFileSync;
          } else {
            fs.renameSync = ((from, to) => {
              if (typeof from === 'string' && path.dirname(from) === blobDir)
                throw new Error('Injected rename failure');
              return rename(from, to);
            }) as typeof fs.renameSync;
          }
          try {
            db.blobWrite(fingerprint, bytes);
          } catch (err) {
            error = (err as Error).message;
          } finally {
            fs.writeFileSync = write;
            fs.renameSync = rename;
          }
          failures.push({
            kind,
            error,
            content: Buffer.from(db.blobRead(fingerprint)).toString(),
            files: fs.readdirSync(blobDir),
          });
        }
        db.blobWrite(fingerprint, bytes);
        return {
          fingerprint,
          content: bytes.toString(),
          failures,
          final: Buffer.from(db.blobRead(fingerprint)).toString(),
        };
      } finally {
        fs.writeFileSync = write;
        fs.renameSync = rename;
        db.close();
      }
    });
    for (const failure of result.failures) {
      expect.soft(failure.error, failure.kind).toMatch(/Injected/);
      expect.soft(failure.content, failure.kind).toBe(result.content);
      expect.soft(failure.files, failure.kind).toEqual([result.fingerprint]);
    }
    expect(result.final).toBe(result.content);
  } finally {
    await app.close();
  }
});
