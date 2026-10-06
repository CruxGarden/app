import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { resolveInsideOrThrow } from './paths';

const MAX_FILES = 10_000;
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * Typst follows symlinks despite --root (upstream issue #5454). Compile a bounded
 * private copy instead: no links, hidden state or dependency folders. Copying
 * bytes also keeps a later ordinary source edit from changing the render's input.
 * A large/unsupported project can still use the browser PDF path.
 */
export async function inTypesetFolder<T>(
  folder: string,
  inputPath: string,
  source: string,
  render: (root: string, input: string) => Promise<T>,
): Promise<T> {
  const scratch = await fs.mkdtemp(path.join(tmpdir(), 'crux-typeset-'));
  let files = 0;
  let bytes = Buffer.byteLength(source);
  const copy = async (relative: string): Promise<void> => {
    const directory = resolveInsideOrThrow(folder, relative || '.');
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (++files > MAX_FILES) throw new Error('This project is too large for the typesetter.');
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const name = path.posix.join(relative, entry.name);
      // Never materialize a symlink, including links to otherwise allowed files.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await fs.mkdir(resolveInsideOrThrow(scratch, name), { recursive: true });
        await copy(name);
      } else if (entry.isFile()) {
        const file = resolveInsideOrThrow(folder, name);
        const info = await fs.lstat(file);
        if (!info.isFile()) throw new Error('A document input changed while being copied.');
        bytes += info.size;
        if (bytes > MAX_BYTES) throw new Error('This project is too large for the typesetter.');
        await fs.copyFile(file, resolveInsideOrThrow(scratch, name));
      }
    }
  };
  try {
    if (bytes > MAX_BYTES) throw new Error('This document is too large for the typesetter.');
    await copy('');
    const input = resolveInsideOrThrow(scratch, inputPath);
    await fs.mkdir(path.dirname(input), { recursive: true });
    await fs.writeFile(input, source);
    return await render(scratch, input);
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
}
