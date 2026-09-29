/** The packaging gate for locally built media executables and their sources. */
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const recipe = () =>
  hash(
    Buffer.concat([
      readFileSync(join(here, 'ffmpeg-sources.json')),
      readFileSync(join(here, 'build-ffmpeg.py')),
    ]),
  );

function requireArchitecture(bytes, platform, arch) {
  let matches = false;
  if (platform === 'darwin' && bytes.length >= 8)
    matches =
      bytes.readUInt32LE(0) === 0xfeedfacf &&
      bytes.readUInt32LE(4) === (arch === 'arm64' ? 0x100000c : 0x1000007);
  if (platform === 'linux' && bytes.length >= 20)
    matches =
      bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
      bytes[4] === 2 &&
      bytes[5] === 1 &&
      bytes.readUInt16LE(18) === (arch === 'arm64' ? 183 : 62);
  if (platform === 'win32' && bytes.length >= 64 && bytes.toString('ascii', 0, 2) === 'MZ') {
    const pe = bytes.readUInt32LE(60);
    matches =
      pe + 6 <= bytes.length &&
      bytes.readUInt32LE(pe) === 0x4550 &&
      bytes.readUInt16LE(pe + 4) === (arch === 'arm64' ? 0xaa64 : 0x8664);
  }
  if (!matches) throw new Error(`Media binary does not target ${platform}-${arch}`);
}

/** Check everything before copying anything. No fallback to a build host's tools. */
export function verifyFfmpegBundle(folder, platform, arch) {
  if (!['darwin', 'linux', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch))
    throw new Error('Unsupported media binary target');
  const receipt = JSON.parse(readFileSync(join(folder, 'receipt.json'), 'utf8'));
  const version = JSON.parse(readFileSync(join(here, 'ffmpeg-sources.json'), 'utf8')).ffmpeg
    .version;
  if (
    receipt.platform !== platform ||
    receipt.arch !== arch ||
    receipt.version !== version ||
    receipt.recipe !== recipe()
  )
    throw new Error(
      'Media build is stale or targets another platform; rebuild from the source lock',
    );
  const exe = (name) => name + (platform === 'win32' ? '.exe' : '');
  const files = [
    exe('ffmpeg'),
    exe('ffprobe'),
    'ffmpeg-version.txt',
    'ffprobe-version.txt',
    'ffmpeg-license.txt',
    'ffprobe-license.txt',
    'COPYING.GPLv3',
    'NOTICE.txt',
    'corresponding-source.tar.gz',
  ];
  for (const file of files) {
    const path = join(folder, file);
    if (!lstatSync(path).isFile() || hash(readFileSync(path)) !== receipt.files?.[file])
      throw new Error(`Media bundle integrity check failed: ${file}`);
  }
  for (const name of ['ffmpeg', 'ffprobe']) {
    requireArchitecture(readFileSync(join(folder, exe(name))), platform, arch);
    const banner = readFileSync(join(folder, `${name}-version.txt`), 'utf8');
    const license = readFileSync(join(folder, `${name}-license.txt`), 'utf8');
    if (
      !banner.startsWith(`${name} version ${version} `) ||
      banner.includes('--enable-nonfree') ||
      !license.includes('GNU General Public License') ||
      license.includes('not legally redistributable')
    )
      throw new Error(`Unapproved media version or license: ${name}`);
  }
  return [...files, 'receipt.json'];
}

export function stageFfmpegBundle(folder, destination, platform, arch) {
  const files = verifyFfmpegBundle(folder, platform, arch);
  mkdirSync(destination, { recursive: true });
  for (const file of files) copyFileSync(join(folder, file), join(destination, file));
}
