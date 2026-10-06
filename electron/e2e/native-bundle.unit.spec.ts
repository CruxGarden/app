import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const scripts = resolve(__dirname, '../scripts');
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

test('packaging requires the correct architecture, current recipe, intact binaries and corresponding source', async () => {
  const { stageFfmpegBundle } = await import(
    pathToFileURL(join(scripts, 'ffmpeg-bundle.mjs')).href
  );
  const folder = mkdtempSync(join(tmpdir(), 'crux-native-bundle-'));
  const destination = join(folder, 'staged');
  const version = JSON.parse(readFileSync(join(scripts, 'ffmpeg-sources.json'), 'utf8')).ffmpeg
    .version;
  const recipe = hash(
    Buffer.concat([
      readFileSync(join(scripts, 'ffmpeg-sources.json')),
      readFileSync(join(scripts, 'build-ffmpeg.py')),
    ]),
  );
  const binary = Buffer.alloc(64);
  binary.writeUInt32LE(0xfeedfacf);
  binary.writeUInt32LE(0x100000c, 4);
  const contents: Record<string, string | Buffer> = {
    ffmpeg: binary,
    ffprobe: binary,
    'ffmpeg-version.txt': `ffmpeg version ${version} Copyright\nconfiguration: --enable-gpl --enable-version3`,
    'ffprobe-version.txt': `ffprobe version ${version} Copyright\nconfiguration: --enable-gpl --enable-version3`,
    'ffmpeg-license.txt': 'GNU General Public License version 3 or later',
    'ffprobe-license.txt': 'GNU General Public License version 3 or later',
    'COPYING.GPLv3': 'license',
    'NOTICE.txt': 'notice',
    'corresponding-source.tar.gz': 'source archive',
  };
  const receipt = {
    platform: 'darwin',
    arch: 'arm64',
    version,
    recipe,
    files: Object.fromEntries(Object.entries(contents).map(([name, bytes]) => [name, hash(bytes)])),
  };
  const saveReceipt = () => writeFileSync(join(folder, 'receipt.json'), JSON.stringify(receipt));
  const stage = () => stageFfmpegBundle(folder, destination, 'darwin', 'arm64');
  try {
    for (const [name, bytes] of Object.entries(contents)) writeFileSync(join(folder, name), bytes);
    chmodSync(join(folder, 'ffmpeg'), 0o755);
    chmodSync(join(folder, 'ffprobe'), 0o755);
    saveReceipt();

    writeFileSync(join(folder, 'ffmpeg'), 'replaced binary');
    expect(stage).toThrow(/integrity/);
    expect(existsSync(destination)).toBe(false);
    writeFileSync(join(folder, 'ffmpeg'), binary);

    rmSync(join(folder, 'corresponding-source.tar.gz'));
    expect(stage).toThrow();
    expect(existsSync(destination)).toBe(false);
    writeFileSync(
      join(folder, 'corresponding-source.tar.gz'),
      contents['corresponding-source.tar.gz'],
    );

    receipt.recipe = 'old build';
    saveReceipt();
    expect(stage).toThrow(/stale/);
    receipt.recipe = recipe;
    saveReceipt();
    expect(() => stageFfmpegBundle(folder, destination, 'darwin', 'x64')).toThrow(
      /another platform/,
    );

    const original = contents['ffmpeg-version.txt'] as string;
    const nonfree = original + ' --enable-nonfree';
    writeFileSync(join(folder, 'ffmpeg-version.txt'), nonfree);
    receipt.files['ffmpeg-version.txt'] = hash(nonfree);
    saveReceipt();
    expect(stage).toThrow(/license/);
    writeFileSync(join(folder, 'ffmpeg-version.txt'), original);
    receipt.files['ffmpeg-version.txt'] = hash(original);
    saveReceipt();

    // A mislabeled receipt must not admit another CPU's actual executable.
    const otherCpu = Buffer.from(binary);
    otherCpu.writeUInt32LE(0x1000007, 4);
    writeFileSync(join(folder, 'ffprobe'), otherCpu);
    receipt.files.ffprobe = hash(otherCpu);
    saveReceipt();
    expect(stage).toThrow(/does not target/);
    writeFileSync(join(folder, 'ffprobe'), binary);
    receipt.files.ffprobe = hash(binary);
    saveReceipt();

    stage();
    expect(readFileSync(join(destination, 'ffprobe'))).toEqual(binary);
    expect(readFileSync(join(destination, 'corresponding-source.tar.gz'), 'utf8')).toBe(
      'source archive',
    );
    expect(readFileSync(join(destination, 'receipt.json'), 'utf8')).toBe(JSON.stringify(receipt));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
