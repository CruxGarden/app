import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { getServices } from './index';
import { notebookPath, isNotebookImage } from './notebook-path';
import { pathOf } from '@/lib/artifact-path';
import { folderForCrux } from './project-folder';

export interface VaultFile {
  path: string;
  content: string;
}
export function validateVaultFiles(value: unknown): VaultFile[] {
  if (!Array.isArray(value) || !value.length || value.length > 2000)
    throw new Error('Import between 1 and 2,000 supported files at a time.');
  let total = 0;
  const names = new Set<string>();
  for (const file of value) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string')
      throw new Error('Invalid notebook import.');
    notebookPath(file.path);
    // The root publication settings are Garden-owned and never imported.
    if (file.path === 'publish.json')
      throw new Error('Publication settings are not notebook content.');
    const folded = file.path.normalize('NFC').toLowerCase();
    if (names.has(folded)) throw new Error('The notebook contains conflicting filenames.');
    names.add(folded);
    total += file.content.length;
    if (file.content.length > 8_000_000 || total > 64_000_000)
      throw new Error('Import is too large. Use a smaller notebook (up to 48 MB of files).');
    if (
      isNotebookImage(file.path) &&
      !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(file.content)
    )
      throw new Error('Invalid notebook image.');
    if (isNotebookImage(file.path)) {
      const decoded = atob(file.content.split(',')[1]!);
      if (decoded.length > 5_000_000) throw new Error('Images must be smaller than 5 MB.');
    }
    if (file.path.endsWith('.json')) JSON.parse(file.content);
  }
  if (!value.some((file) => /\.md$/i.test(file.path)))
    throw new Error('Choose a folder containing Markdown notes.');
  return value as VaultFile[];
}
/** Copy only into a new folder; no existing note, publication selection or source is replaced. */
export async function importNotebook(
  workspace: StoreApi<CruxState>,
  request: Record<string, unknown>,
) {
  const state = workspace.getState();
  const owner = state.crux!.id;
  const files = validateVaultFiles(request.files);
  const name = typeof request.name === 'string' ? request.name.trim() : '';
  if (!name || name.includes('/') || name.startsWith('.'))
    throw new Error('Choose a name for the imported notebook.');
  notebookPath(`Imported/${name}/Note.md`);
  const { artifact } = getServices();
  const existing = await artifact.findByResource('crux', owner);
  const occupied = existing.map((a) => pathOf(a).normalize('NFC').toLowerCase());
  let root = `Imported/${name}`;
  for (
    let i = 2;
    occupied.some((path) => path.startsWith(`notebook/${root.normalize('NFC').toLowerCase()}/`));
    i++
  )
    root = `Imported/${name} ${i}`;
  const paths = files.map((file) => notebookPath(`${root}/${file.path}`));
  const folder = await folderForCrux(owner);
  // A watcher may not have indexed an external file yet. Check disk before writing any file.
  if (folder)
    for (const path of paths) {
      try {
        await window.electronAPI!.project.readFile(folder, path);
      } catch (error) {
        if (String(error).includes('ENOENT')) continue;
        throw error;
      }
      throw new Error('This import folder already exists on disk. Choose another import name.');
    }
  await state.createSnapshot({ label: 'Before notebook import', ifChanged: true, silent: true });
  let imported = 0;
  try {
    for (const [index, file] of files.entries()) {
      const path = paths[index]!;
      if (isNotebookImage(path)) {
        const [header, base64] = file.content.split(',');
        const bytes = Uint8Array.from(atob(base64!), (c) => c.charCodeAt(0));
        if (bytes.length > 5_000_000) throw new Error('Images must be smaller than 5 MB.');
        await artifact.upload({
          resourceId: owner,
          blob: new Blob([bytes], { type: header!.slice(5, -7) }),
          meta: { path },
        });
      } else await artifact.create({ resourceId: owner, content: file.content, meta: { path } });
      imported++;
    }
  } catch (error) {
    await workspace.getState().refreshArtifacts();
    if (imported)
      await workspace
        .getState()
        .createSnapshot({ label: `Partial notebook import: ${imported} files`, silent: true });
    throw new Error(
      `${imported} of ${files.length} files were copied into ${root}. Existing files were kept. ${String(error)}`,
      { cause: error },
    );
  }
  await workspace.getState().refreshArtifacts();
  await workspace
    .getState()
    .createSnapshot({ label: `Imported notebook: ${name}`, ifChanged: true, silent: true });
  return {
    root,
    imported,
    notes: files.filter((f) => /\.md$/i.test(f.path)).length,
    firstNote: `${root}/${files.find((f) => /\.md$/i.test(f.path))!.path}`,
  };
}
