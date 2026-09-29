import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveInsideOrThrow } from './paths';

export function nativeArguments(input: unknown): string[] {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > 128 ||
    input.some((arg) => typeof arg !== 'string' || !arg || arg.length > 8192 || arg.includes('\0'))
  )
    throw new Error('Give the native tool a bounded list of text arguments.');
  return input;
}

/** Check actual directory entries, not just the spelling of an image pattern. */
export function mediaPath(
  folder: string,
  value: string,
  mode: 'input' | 'output',
  glob = false,
): string {
  if (value === '-' || /[@[\]{}]/.test(value)) throw new Error('Choose a local media filename.');
  const normalized = value.replace(/\\/g, '/');
  const directory = path.posix.dirname(normalized);
  const name = path.posix.basename(normalized);
  if (/[%*?]/.test(directory)) throw new Error('Frame patterns belong in the filename only.');
  const token = glob ? /\*/g : /%0?[1-8]?d/g;
  const matches = name.match(token);
  const replacement = glob ? '.*' : '[0-9]+';
  const literal = name.replace(token, '');
  if (/[%*?]/.test(literal) || (matches && matches.length !== 1))
    throw new Error('Use one numeric frame token or one image glob in a filename.');
  const parent = resolveInsideOrThrow(folder, directory);
  const check = (relative: string) => {
    const absolute = resolveInsideOrThrow(folder, relative);
    let info: fs.Stats;
    try {
      info = fs.lstatSync(absolute);
    } catch (error) {
      if (mode === 'output' && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    // Refuse links even when dangling: realpath cannot resolve those. Refusing
    // hardlinks also prevents overwriting an inode shared with an outside file.
    if (!info.isFile() || info.nlink > 1)
      throw new Error(`Choose a regular media file: ${relative}`);
  };
  if (!matches) {
    check(normalized);
    return resolveInsideOrThrow(folder, normalized);
  }
  const escaped = name.split(token).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`^${escaped.join(replacement)}$`, 'i');
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(parent);
  } catch (error) {
    if (mode !== 'output' || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (entries.length > 10_000) throw new Error('This media folder has too many files.');
  const selected = entries.filter((entry) => pattern.test(entry));
  if (mode === 'input' && !selected.length) throw new Error('No frames match this pattern.');
  for (const entry of selected) check(path.posix.join(directory, entry));
  // A glob is only emitted after the parent and all concrete members pass.
  return path.join(parent, name);
}
