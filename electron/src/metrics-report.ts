import * as fs from 'node:fs';
import * as path from 'node:path';
import { isInside, resolveInsideOrThrow } from './paths';

const ENTRY = /^={72}\n\d{4}-\d\d-\d\dT[^\n]+\n={72}\nAgent metrics since /;
const MAX_ENTRY = 64 * 1024;
const MAX_FILE = 1024 * 1024;
function signature(stat: fs.Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}:${stat.nlink}`;
}

/** Append only a metrics report, without granting the Garden Root as a project. */
export function appendMetricsReport(
  root: string,
  relative: string,
  text: string,
  projects: string[],
): string {
  if (typeof relative !== 'string' || typeof text !== 'string' || !ENTRY.test(text))
    throw new Error('Choose a report path and append a valid metrics report.');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > MAX_ENTRY) throw new Error('This report exceeds 64 KiB. Copy it instead.');
  const segments = relative.replace(/\\/g, '/').split('/');
  if (segments.some((part) => !part || part.startsWith('.')) || !/\.(md|log|txt)$/i.test(relative))
    throw new Error('Use a relative .md, .log or .txt report path without hidden folders.');
  fs.mkdirSync(root, { recursive: true });
  const base = fs.realpathSync(root);
  const file = resolveInsideOrThrow(base, relative);
  if (projects.some((project) => isInside(project, file)))
    throw new Error('Keep reports outside Project Folders. Choose a separate reports folder.');
  if (file.toLowerCase() === path.join(base, 'memory.md').toLowerCase())
    throw new Error('memory.md is reserved for Memory. Choose another report path.');
  let parent = base;
  for (const segment of segments.slice(0, -1)) {
    parent = path.join(parent, segment);
    try {
      fs.mkdirSync(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = fs.lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Report folders must be ordinary folders, not links.');
  }
  let before: fs.Stats | null = null;
  try {
    before = fs.lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1))
    throw new Error('The report must be a regular file, not a link or folder.');
  if ((before?.size ?? 0) + bytes.length > MAX_FILE)
    throw new Error('This report file has reached 1 MiB. Choose a new report path.');
  const fd = fs.openSync(
    file,
    fs.constants.O_RDWR |
      fs.constants.O_APPEND |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (before ? 0 : fs.constants.O_CREAT | fs.constants.O_EXCL),
    0o600,
  );
  try {
    const opened = fs.fstatSync(fd);
    if (before && signature(opened) !== signature(before))
      throw new Error('The report file changed. Review the path and retry.');
    if (before?.size) {
      const prefix = Buffer.alloc(512);
      const count = fs.readSync(fd, prefix, 0, prefix.length, 0);
      if (!ENTRY.test(prefix.subarray(0, count).toString('utf8')))
        throw new Error('That file is not a metrics report. Choose another path; it is unchanged.');
    }
    if (signature(fs.lstatSync(file)) !== signature(opened))
      throw new Error('The report file changed. Review the path and retry.');
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    return file;
  } finally {
    fs.closeSync(fd);
  }
}
