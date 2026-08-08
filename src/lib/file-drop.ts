/**
 * OS drag-and-drop helpers for harvesting files (and whole folders) from a
 * DataTransfer's FileSystemEntry tree. Canonical home for the walkEntry /
 * readAllEntries pair previously duplicated in ArtifactsPane and
 * ArboristFileTree.
 */

/** A file harvested from an OS drop, with its drop-relative path. */
export interface DroppedFile {
  file: File;
  path: string;
}

/** Recursively collect all files under a FileSystemEntry (file or directory). */
export async function walkEntry(entry: FileSystemEntry, basePath: string): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [{ file, path: basePath + entry.name }];
  }
  const dirReader = (entry as FileSystemDirectoryEntry).createReader();
  const children = await readAllEntries(dirReader);
  const results: DroppedFile[] = [];
  for (const child of children) {
    results.push(...(await walkEntry(child, basePath + entry.name + '/')));
  }
  return results;
}

/** Drain a directory reader — readEntries may return partial results. */
export function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all);
        } else {
          all.push(...entries);
          readBatch();
        }
      }, reject);
    }
    readBatch();
  });
}
