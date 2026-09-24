import { createHash } from 'node:crypto';
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrepareImportedWorkspace } from '@cruxgarden/local-api';
import type { ProjectFolders } from './projects';

/** Trusted import preparation: allocate exclusively, verify before registration,
 * and leave prepared files alone if the owning API transaction later refuses. */
export function importedWorkspacePreparer(
  projects: ProjectFolders,
  blobDir: string,
): PrepareImportedWorkspace {
  return async (workspace) => {
    const folder = projects.createFolder(workspace.slug ?? `import-${workspace.id}`);
    // The internal Garden thumbnail stays in the manifest/Blob Store, as for
    // ordinary Project Folder projection; it is not an editable source file.
    const files = workspace.files.filter((file) => file.path.toLowerCase() !== 'preview.jpg');
    for (let start = 0; start < files.length; start += 2000)
      projects.materialize(folder, blobDir, files.slice(start, start + 2000));
    for (const file of files) {
      const bytes = projects.readFile(folder, file.path);
      if (
        bytes.length !== file.size ||
        createHash('sha256').update(bytes).digest('hex') !== file.fingerprint ||
        (process.platform !== 'win32' &&
          (statSync(join(folder, file.path)).mode & 0o777) !== (file.mode & 0o777))
      )
        throw new Error(`Imported file failed verification: ${file.path}`);
    }
    const expected = new Set(files.map((file) => file.path));
    // Use the physical listing, not watcher ignore rules: ignored payloads must
    // still exist, and a case-insensitive filesystem must not collapse two paths.
    const actual: string[] = [];
    const visit = (relative = '') => {
      for (const entry of readdirSync(join(folder, relative), { withFileTypes: true })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile()) actual.push(path);
        else throw new Error('Imported Project Folders cannot contain links or special files');
      }
    };
    visit();
    if (actual.length !== expected.size || actual.some((path) => !expected.has(path)))
      throw new Error('The imported Project Folder changed during preparation');
    return folder;
  };
}
