import fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { FileWriteIntent, FileDeleteIntent } from '@cruxgarden/local-api';
import { projectFileModeMatches } from './project-file-mode';

/** The caller grants these paths. Admission reads only; committed operations stage
 * the original inode privately and never replace a later arrival at the live path. */
export function projectFileOperation(
  base: string,
  target: string,
  intent: FileWriteIntent | FileDeleteIntent,
  apply: boolean,
  bytes?: Uint8Array,
): void {
  if (!/^[a-f0-9-]{36}$/.test(intent.operationId)) throw new Error('Invalid file operation');
  const before = intent.kind === 'write' ? intent.before : intent.source;
  const after = intent.kind === 'write' ? intent.entry : null;
  const relative = after?.path ?? before!.path;
  const recovery = path.join(base, '.crux-recovery');
  const parent = path.join(recovery, intent.kind);
  const stage = path.join(parent, intent.operationId);
  const original = path.join(stage, 'original');
  const replacement = path.join(stage, 'replacement');
  const conflict = () =>
    new Error(
      `Files changed during ${intent.kind}. No unexpected files were overwritten. Preserved files, if staged, are in ${stage}. Resolve the conflicting paths and reopen this Crux to retry.`,
    );
  const signature = (stat: fs.Stats) =>
    `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  const inspect = (file: string) => {
    let fd: number | undefined;
    try {
      const selected = fs.lstatSync(file);
      if (!selected.isFile() || selected.isSymbolicLink()) throw conflict();
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || signature(selected) !== signature(opened)) throw conflict();
      const fingerprint = createHash('sha256').update(fs.readFileSync(fd)).digest('hex');
      if (
        signature(opened) !== signature(fs.fstatSync(fd)) ||
        signature(opened) !== signature(fs.lstatSync(file))
      )
        throw conflict();
      return { fingerprint, mode: opened.mode & 0o777, dev: opened.dev, ino: opened.ino };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  };
  const sameInode = (left: ReturnType<typeof inspect>, right: ReturnType<typeof inspect>) =>
    left !== null && right !== null && left.dev === right.dev && left.ino === right.ino;
  const matches = (current: ReturnType<typeof inspect>, expected: typeof before) =>
    current === null || expected === null
      ? current === null && expected === null
      : current.fingerprint === expected.fingerprint &&
        projectFileModeMatches(current.mode, expected.mode);
  const requireDirectory = (directory: string) => {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw conflict();
  };
  for (const directory of [recovery, parent, stage]) {
    try {
      requireDirectory(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const receipt = path.join(stage, 'completed.json');
  const expectedReceipt = JSON.stringify({
    kind: intent.kind,
    operationId: intent.operationId,
    path: relative,
    before: before ? { fingerprint: before.fingerprint, mode: before.mode & 0o777 } : null,
    after: after ? { fingerprint: after.fingerprint, mode: after.mode & 0o777 } : null,
  });
  if (apply) {
    try {
      const stat = fs.lstatSync(receipt);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        fs.readFileSync(receipt, 'utf8') !== expectedReceipt
      )
        throw conflict();
      return; // A completed operation never overwrites later work during replay.
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (!apply) {
    if (!matches(inspect(target), before)) throw conflict();
    return;
  }
  // Only directories present for this deletion may be pruned. Keep their
  // identities so a later replacement folder (or symlink) is not cleanup work.
  const deleteParents: { directory: string; dev: number; ino: number }[] = [];
  if (!after) {
    for (
      let directory = path.dirname(target);
      directory === base || directory.startsWith(base + path.sep);
      directory = path.dirname(directory)
    ) {
      try {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw conflict();
        deleteParents.push({ directory, dev: stat.dev, ino: stat.ino });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw error;
      }
      if (directory === base) break;
    }
  }
  if (
    after &&
    (!bytes ||
      bytes.length !== after.size ||
      createHash('sha256').update(bytes).digest('hex') !== after.fingerprint)
  )
    throw new Error('File replacement bytes failed verification');
  for (const directory of [recovery, parent, stage]) {
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    requireDirectory(directory);
  }
  try {
    fs.writeFileSync(
      path.join(stage, 'README.txt'),
      `Crux Garden ${intent.kind} safety files\nOriginal path: ${relative}\nThe original file retains the previous inode, including later writes through an already-open editor. The replacement, if present, may be hardlinked to the live path: copy it elsewhere before editing. Files are kept indefinitely; copy needed bytes out before removing this directory. Unexpected files are never discarded automatically.\n`,
      { flag: 'wx', mode: 0o600 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (after) {
    if (inspect(replacement) === null) {
      fs.writeFileSync(replacement, bytes!, { flag: 'wx', mode: after.mode & 0o777 });
      fs.chmodSync(replacement, after.mode & 0o777);
    }
    if (!matches(inspect(replacement), after)) throw conflict();
  }
  if (before) {
    if (inspect(original) === null) {
      const selected = inspect(target);
      if (!matches(selected, before)) throw conflict();
      // Reserve the expected inode exclusively before removing its live name.
      fs.linkSync(target, original);
      const staged = inspect(original);
      if (!sameInode(selected, staged) || !matches(staged, before)) {
        throw conflict();
      }
    }
    const staged = inspect(original);
    if (!matches(staged, before)) throw conflict();
    if (sameInode(inspect(target), staged)) {
      // Rename into an exclusively allocated private directory: if the live
      // inode changes after inspection, that arrival survives here too.
      const moved = path.join(fs.mkdtempSync(path.join(stage, 'move-')), 'file');
      fs.renameSync(target, moved);
      const removed = inspect(moved);
      if (!sameInode(staged, removed) || !matches(removed, before)) {
        try {
          fs.linkSync(moved, target);
        } catch {
          /* Both paths remain preserved. */
        }
        throw conflict();
      }
    }
  }
  const live = inspect(target);
  if (after) {
    if (live === null) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.linkSync(replacement, target);
    }
    const current = inspect(target);
    if (!sameInode(current, inspect(replacement)) || !matches(current, after)) throw conflict();
  } else if (live !== null) {
    throw conflict();
  }
  fs.writeFileSync(receipt, expectedReceipt, { flag: 'wx', mode: 0o600 });
  // The receipt precedes optional cleanup: replay must never remove a folder
  // recreated after completion. rmdir itself refuses any arriving contents.
  for (let i = 0; i < deleteParents.length; i++) {
    const { directory } = deleteParents[i]!;
    if (directory === base) break;
    try {
      for (const ancestor of deleteParents.slice(i)) {
        const current = fs.lstatSync(ancestor.directory);
        if (
          !current.isDirectory() ||
          current.isSymbolicLink() ||
          current.dev !== ancestor.dev ||
          current.ino !== ancestor.ino
        )
          return;
      }
      fs.rmdirSync(directory);
    } catch {
      break;
    }
  }
}
