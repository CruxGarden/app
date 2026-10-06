import fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { FileRenameIntent } from '@cruxgarden/local-api';
import { projectFileModeMatches } from './project-file-mode';

/** Paths have already been admitted by ProjectFolders. Private in-folder paths retain
 * staged bytes across a crash; final hard-link creation never replaces arrivals. */
export function projectRename(
  base: string,
  from: string,
  to: string,
  intent: FileRenameIntent,
  apply: boolean,
): void {
  if (!/^[a-f0-9-]{36}$/.test(intent.operationId)) throw new Error('Invalid rename operation');
  const recovery = path.join(base, '.crux-recovery');
  const parent = path.join(recovery, 'rename');
  const stage = path.join(parent, intent.operationId);
  const stagedSource = path.join(stage, 'source');
  const stagedTarget = path.join(stage, 'target');
  const fingerprint = (file: string): string | null => {
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error(`Rename requires regular files: ${file}`);
      return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };
  const sameFile = (left: string, right: string) => {
    try {
      const a = fs.statSync(left);
      const b = fs.statSync(right);
      return a.dev === b.dev && a.ino === b.ino;
    } catch {
      return false;
    }
  };
  const matches = (file: string, expected: string, mode: number) => {
    if (fingerprint(file) !== expected) return false;
    try {
      return projectFileModeMatches(fs.lstatSync(file).mode, mode);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  };
  const sourceFp = intent.source.fingerprint;
  const targetFp = intent.target?.fingerprint ?? null;
  const aliasSpelling =
    intent.source.path.normalize('NFC').toLowerCase() ===
    intent.entry.path.normalize('NFC').toLowerCase();
  const conflict = () =>
    new Error(
      `Files changed during rename. No unexpected files were overwritten. Preserved files, if staged, are in ${stage}. Resolve the conflicting paths and reopen this Crux to retry.`,
    );
  for (const directory of [recovery, parent, stage]) {
    if (
      fs.existsSync(directory) &&
      (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())
    )
      throw conflict();
  }
  const receipt = path.join(stage, 'completed.json');
  const expectedReceipt = JSON.stringify({
    operationId: intent.operationId,
    source: intent.source.path,
    target: intent.entry.path,
    fingerprint: sourceFp,
  });
  if (apply && fs.existsSync(receipt)) {
    if (
      !fs.lstatSync(receipt).isFile() ||
      fs.lstatSync(receipt).isSymbolicLink() ||
      fs.readFileSync(receipt, 'utf8') !== expectedReceipt
    )
      throw conflict();
    return; // Proven completion; preserve every later edit for normal ingestion.
  }
  if (!apply) {
    const alias = targetFp === null && aliasSpelling && sameFile(from, to);
    if (
      !matches(from, sourceFp, intent.source.mode) ||
      (!alias &&
        (intent.target ? !matches(to, targetFp!, intent.target.mode) : fingerprint(to) !== null))
    )
      throw conflict();
    return;
  }
  for (const directory of [recovery, parent]) {
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())
      throw conflict();
  }
  try {
    fs.mkdirSync(stage, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!fs.lstatSync(stage).isDirectory() || fs.lstatSync(stage).isSymbolicLink())
      throw conflict();
  }
  const note = path.join(stage, 'README.txt');
  try {
    fs.writeFileSync(
      note,
      `Crux Garden rename safety files\nOriginal source: ${intent.source.path}\nOriginal destination: ${intent.entry.path}\nThe target file retains the replaced destination, including later writes from an already-open editor. The source file may be hardlinked to the current destination: copy it elsewhere before editing. Files are kept indefinitely; copy needed bytes out before removing this directory. Unexpected files are never discarded automatically.\n`,
      { flag: 'wx', mode: 0o600 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stageFile = (live: string, staged: string, expected: string, mode: number) => {
    if (fingerprint(staged) === null) {
      if (!matches(live, expected, mode)) throw conflict();
      // The private directory is intent-specific; never replace an existing stage.
      fs.renameSync(live, staged);
    }
    if (!matches(staged, expected, mode)) {
      // An external writer raced the move. Keep its exact bytes and restore a
      // visible link only if the original name is still free.
      try {
        fs.linkSync(staged, live);
      } catch {
        /* preserve both paths */
      }
      throw conflict();
    }
  };
  stageFile(from, stagedSource, sourceFp, intent.source.mode);
  if (fingerprint(from) !== null) throw conflict();
  if (targetFp !== null && fingerprint(stagedTarget) === null && !sameFile(to, stagedSource))
    stageFile(to, stagedTarget, targetFp, intent.target!.mode);
  if (
    targetFp !== null &&
    !matches(stagedTarget, targetFp, intent.target!.mode) &&
    !sameFile(to, stagedSource)
  )
    throw conflict();
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fingerprint(to) === null) fs.linkSync(stagedSource, to);
  if (
    !sameFile(to, stagedSource) ||
    !matches(to, sourceFp, intent.source.mode) ||
    (fingerprint(from) !== null && !(aliasSpelling && sameFile(from, to)))
  )
    throw conflict();
  // The receipt is written only after the exclusive link was verified. Retry
  // recognizes completion without replacing later external edits. Keep both
  // staged inodes: an external editor can still hold and write either handle.
  fs.writeFileSync(receipt, expectedReceipt, { flag: 'wx', mode: 0o600 });
}
