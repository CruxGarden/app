import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Fixed installation-owned file; this grants no Project Folder access. */
export const MEMORY_MAX_BYTES = 64 * 1024;
function location(root: string): string {
  fs.mkdirSync(root, { recursive: true });
  return path.join(fs.realpathSync(root), 'memory.md');
}
function regular(file: string): fs.Stats | null {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error('memory.md must be a regular file, not a link or folder.');
    if (stat.size > MEMORY_MAX_BYTES)
      throw new Error('Memory is limited to 64 KiB. Shorten memory.md and retry.');
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function signature(stat: fs.Stats | null): string {
  return stat
    ? `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}:${stat.nlink}`
    : 'missing';
}
function read(file: string): string | null {
  const before = regular(file);
  if (!before) return null;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (signature(fs.fstatSync(fd)) !== signature(before))
      throw new Error('Memory changed. Reload it and retry.');
    const bytes = Buffer.alloc(MEMORY_MAX_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = fs.readSync(fd, bytes, size, bytes.length - size, size);
      if (!count) break;
      size += count;
    }
    if (size > MEMORY_MAX_BYTES)
      throw new Error('Memory is limited to 64 KiB. Shorten memory.md and retry.');
    if (
      signature(fs.fstatSync(fd)) !== signature(before) ||
      signature(regular(file)) !== signature(before)
    )
      throw new Error('Memory changed. Reload it and retry.');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
  } finally {
    fs.closeSync(fd);
  }
}
export function readGardenMemory(root: string): string | null {
  return read(location(root));
}
export function writeGardenMemory(root: string, text: string, expected: string | null): void {
  if (typeof text !== 'string' || (expected !== null && typeof expected !== 'string'))
    throw new Error('Memory requires text and the reviewed file contents.');
  if (
    Buffer.byteLength(text, 'utf8') > MEMORY_MAX_BYTES ||
    (expected !== null && Buffer.byteLength(expected, 'utf8') > MEMORY_MAX_BYTES)
  )
    throw new Error('Memory is limited to 64 KiB. Shorten your notes and retry.');
  const file = location(root);
  if (read(file) !== expected)
    throw new Error('Memory changed in another app. Reload it before saving.');
  const before = regular(file);
  const temporary = path.join(path.dirname(file), `.memory-${randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(temporary, 'wx', before ? before.mode & 0o777 : 0o600);
    try {
      fs.writeFileSync(fd, text, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (signature(regular(file)) !== signature(before) || read(file) !== expected)
      throw new Error('Memory changed in another app. Reload it before saving.');
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
