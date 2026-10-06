import { getSqliteClient, type ISqliteClient } from './sqlite/client';

const commands = [
  'createWorkingCopy',
  'prepareWorkingCopyFolder',
  'finishWorkingCopySetup',
  'workingCopyBase',
  'saveTaskReview',
  'beginTaskMerge',
  'completeTaskMerge',
  'releaseTaskReview',
  'setWorkingCopyArchived',
  'updateWorkingCopyMeta',
] as const;
type TaskStorage = ISqliteClient &
  Required<Pick<ISqliteClient, (typeof commands)[number] | 'fileContent'>>;

/** Admit the complete native Task workflow before opening workspaces or changing files. */
export function taskStorage(): TaskStorage {
  const db = getSqliteClient();
  if (!db.fileContent || commands.some((name) => typeof db[name] !== 'function'))
    throw new Error('Task storage is unavailable. Restart the updated desktop app.');
  return db as TaskStorage;
}
