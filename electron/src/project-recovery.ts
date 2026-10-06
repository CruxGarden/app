import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { RecoveryOperation, RecoveryOverview } from './bridge';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const kinds = ['write', 'delete', 'rename'];
const inode = (stat: fs.Stats) => `${stat.dev}:${stat.ino}`;
const signature = (stat: fs.Stats, includeChangeTime = true) =>
  [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.size,
    stat.mtimeMs,
    ...(includeChangeTime ? [stat.ctimeMs] : []),
    stat.nlink,
  ].join(':');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const changed = () => new Error('Recovery files changed. Refresh the review before trying again.');

/** Bounded-memory comparison for aliases affected by our own OS Trash move. */
function fingerprint(file: string, expected: fs.Stats) {
  const fd = fs.openSync(file, 'r');
  try {
    if (signature(fs.fstatSync(fd)) !== signature(expected)) throw changed();
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let count: number;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, count));
    if (
      signature(fs.fstatSync(fd)) !== signature(expected) ||
      signature(fs.lstatSync(file)) !== signature(expected)
    )
      throw changed();
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function directory(file: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Recovery contains an unsafe directory. Review it manually.');
  return stat;
}

/** No traversal of unknown shapes or links. Receipts stay at their original paths
 * after maintenance: replay must continue to recognize completed operations. */
export class ProjectRecovery {
  constructor(private resolve: (folder: string) => string) {}

  private location(folder: string, kind?: string, id?: string) {
    const base = this.resolve(folder);
    try {
      directory(base);
    } catch (error) {
      if (missing(error))
        throw new Error(
          'Project Folder is unavailable. Reconnect its drive or restore its location, then refresh.',
          { cause: error },
        );
      throw error;
    }
    const root = path.join(base, '.crux-recovery');
    directory(root);
    if (kind === undefined) return root;
    if (!kinds.includes(kind) || !id || !uuid.test(id))
      throw new Error('Invalid recovery selection');
    directory(path.join(root, kind));
    const stage = path.join(root, kind, id);
    directory(stage);
    return stage;
  }

  private inspect(folder: string, kind: string, id: string) {
    const stage = this.location(folder, kind, id);
    const marks = new Map<string, string>();
    const stats = new Map<string, fs.Stats>();
    const inodes = new Map<string, number>();
    let fileCount = 0;
    const walk = (file: string, depth: number) => {
      if (depth > 3 || marks.size > 1000)
        throw new Error('Unrecognized recovery contents. Review them manually.');
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
        throw new Error('Recovery contains a link or special file. Review it manually.');
      marks.set(path.relative(stage, file), signature(stat));
      stats.set(path.relative(stage, file), stat);
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name), depth + 1);
      } else {
        fileCount++;
        inodes.set(`${stat.dev}:${stat.ino}`, stat.size);
      }
    };
    const names = fs.readdirSync(stage).sort();
    const payload = names.filter((name) => name !== 'completed.json' && name !== 'README.txt');
    for (const name of names) walk(path.join(stage, name), 0);
    let reason: string | null = null;
    let originalPath = 'Unknown path';
    let completedAt: number | null = null;
    try {
      const receipt = path.join(stage, 'completed.json');
      const stat = fs.lstatSync(receipt);
      if (!stat.isFile() || stat.size > 16384) throw new Error('Invalid receipt');
      const value = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      const fingerprint = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
      const entry = (v: { fingerprint?: unknown; mode?: unknown } | null) =>
        v === null || (v && fingerprint(v.fingerprint) && Number.isInteger(v.mode));
      if (
        value.operationId !== id ||
        (kind === 'rename'
          ? typeof value.source !== 'string' ||
            typeof value.target !== 'string' ||
            !fingerprint(value.fingerprint)
          : value.kind !== kind ||
            typeof value.path !== 'string' ||
            !entry(value.before) ||
            !entry(value.after) ||
            (kind === 'write' ? !value.after : !value.before || value.after !== null))
      )
        throw new Error('Invalid receipt');
      originalPath = kind === 'rename' ? `${value.source} → ${value.target}` : value.path;
      completedAt = stat.mtimeMs;
      marks.set('$receipt', JSON.stringify(value));
    } catch {
      reason =
        'Unfinished or unrecognized operation. Reopen the Crux to finish recovery before cleanup.';
    }
    const allowed =
      kind === 'rename' ? /^(source|target)$/ : /^(original|replacement|move-[A-Za-z0-9]+)$/;
    if (payload.some((name) => !allowed.test(name)))
      reason = 'Unrecognized files. Review them manually; cleanup is disabled.';
    for (const name of payload) {
      const file = path.join(stage, name);
      const stat = fs.lstatSync(file);
      const knownMove = name.startsWith('move-') && kind !== 'rename';
      if (
        knownMove
          ? !stat.isDirectory() ||
            fs.readdirSync(file).join() !== 'file' ||
            !fs.lstatSync(path.join(file, 'file')).isFile()
          : !stat.isFile()
      )
        reason = 'Unrecognized files. Review them manually; cleanup is disabled.';
    }
    // Count file data once per inode. This is not physical allocation or reclaimable space.
    const operation: RecoveryOperation = {
      folder,
      kind,
      id,
      originalPath,
      completedAt,
      fileCount,
      bytes: [...inodes.values()].reduce((a, b) => a + b, 0),
      token: createHash('sha256')
        .update(JSON.stringify([...marks]))
        .digest('hex'),
      reason,
      hasPayload: payload.length > 0,
    };
    return { operation, inodes, payload, stage, marks, stats };
  }

  overview(folders: string[]): RecoveryOverview {
    const operations: RecoveryOperation[] = [];
    const warnings: string[] = [];
    const inodes = new Map<string, number>();
    for (const folder of folders) {
      let root: string;
      try {
        root = this.location(folder);
      } catch (error) {
        if (!missing(error))
          warnings.push(`${folder}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      for (const kind of fs.readdirSync(root).sort()) {
        if (!kinds.includes(kind)) {
          warnings.push(`${folder}: unrecognized recovery group ${kind}`);
          continue;
        }
        try {
          directory(path.join(root, kind));
          for (const id of fs.readdirSync(path.join(root, kind)).sort()) {
            try {
              const item = this.inspect(folder, kind, id);
              operations.push(item.operation);
              for (const [inode, size] of item.inodes) inodes.set(inode, size);
            } catch (error) {
              warnings.push(
                `${folder}/${kind}/${id}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        } catch (error) {
          warnings.push(`${folder}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return { operations, warnings, bytes: [...inodes.values()].reduce((a, b) => a + b, 0) };
  }

  reveal(folder: string, kind: string, id: string) {
    return this.location(folder, kind, id);
  }

  async trash(
    selected: RecoveryOperation,
    trashItem: (file: string) => Promise<void>,
  ): Promise<void> {
    let current = this.inspect(selected.folder, selected.kind, selected.id);
    if (current.operation.reason) throw new Error(current.operation.reason);
    if (current.operation.token !== selected.token) throw changed();
    // Awaiting OS Trash may allow another writer to run. Recheck every remaining
    // file between moves. Partial refusal is truthful and a fresh review can retry.
    for (const name of current.payload) {
      const next = this.inspect(selected.folder, selected.kind, selected.id);
      if (next.operation.reason || next.operation.token !== current.operation.token)
        throw changed();
      const moved = (file: string) => file === name || file.startsWith(name + path.sep);
      const movedInodes = new Set(
        [...next.stats]
          .filter(([file, stat]) => moved(file) && stat.isFile())
          .map(([, stat]) => inode(stat)),
      );
      const aliases = new Map(
        [...next.stats]
          .filter(([file, stat]) => !moved(file) && stat.isFile() && movedInodes.has(inode(stat)))
          .map(([file, stat]) => [
            file,
            {
              stat,
              hash: fingerprint(path.join(next.stage, file), stat),
            },
          ]),
      );
      await trashItem(path.join(next.stage, name));
      current = this.inspect(selected.folder, selected.kind, selected.id);
      const expected = new Map([...next.marks].filter(([file]) => !moved(file)));
      if (current.marks.size !== expected.size) throw changed();
      for (const [file, mark] of current.marks) {
        if (mark === expected.get(file)) continue;
        const alias = aliases.get(file);
        const stat = current.stats.get(file);
        // Windows Recycle Bin changes ctime on the shared inode when moving
        // another alias. Only that own-move alias may differ, and only in ctime
        // with verified identical bytes. All other metadata stays strict.
        if (
          !alias ||
          !stat ||
          signature(stat, false) !== signature(alias.stat, false) ||
          fingerprint(path.join(current.stage, file), stat) !== alias.hash
        )
          throw changed();
      }
    }
  }
}
