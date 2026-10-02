import type { TaskHistorySelection } from '@cruxgarden/local-api';
import { getSqliteClient } from './sqlite/client';
import { getServices } from './index';
import { pathOf } from '@/lib/artifact-path';
import { readSelectedFile, selectCruxFiles, type FileReference } from './file-content';

/** History's file view is metadata plus an explicit content address. It is not
 * an Artifact database record. The record source disappears with the remaining
 * non-manifest backends/Task consumers; established heads never fall back. */
export interface CheckpointFile {
  id: string;
  path: string;
  size: number;
  mimeType: string;
  encoding: string;
  source:
    | { kind: 'manifest'; file: FileReference }
    | { kind: 'record'; id: string }
    | { kind: 'task-history'; selection: TaskHistorySelection; root: string; path: string };
}

export async function checkpointFiles(cruxId: string): Promise<CheckpointFile[]> {
  const selected = await selectCruxFiles(cruxId);
  if (selected) {
    return selected.entries.map((entry) => ({
      id: entry.id,
      path: entry.path,
      size: entry.size,
      mimeType: entry.mimeType,
      encoding: entry.encoding,
      source: {
        kind: 'manifest',
        file: {
          cruxId,
          expected: { root: selected.head.root, revision: selected.head.revision },
          path: entry.path,
        },
      },
    }));
  }
  return (await getServices().artifact.findByResource('crux', cruxId)).map((artifact) => ({
    id: artifact.id,
    path: pathOf(artifact),
    size: artifact.size,
    mimeType: artifact.mimeType,
    encoding: artifact.encoding,
    source: { kind: 'record', id: artifact.id },
  }));
}

export async function readCheckpointFile(file: CheckpointFile): Promise<Blob> {
  if (file.source.kind === 'task-history') {
    const read = getSqliteClient().readTaskHistoryFile;
    if (!read) throw new Error('Task history inspection is unavailable.');
    const result = await read(file.source.selection, file.source.root, file.source.path);
    if (!result) throw new Error('This file is missing from the retained Task state.');
    return new Blob([new Uint8Array(result.bytes)], { type: result.entry.mimeType });
  }
  if (file.source.kind === 'record') return getServices().artifact.downloadBlob(file.source.id);
  const result = await readSelectedFile(file.source.file);
  return new Blob([new Uint8Array(result.bytes)], { type: result.entry.mimeType });
}
