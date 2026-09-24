import { getSqliteClient } from './sqlite/client';
import { settleIngestion } from './ingestion';
import { flushNotebook } from './notebook-lifecycle';
import { getWorkspace } from '@/stores/workspaceRegistry';
import { documentsFor } from './workspace-documents';
import { assertCopyWritable } from './working-copies';

const api = () => {
  const content = getSqliteClient().fileContent;
  if (!content) throw new Error('Edit history is unavailable on this connection.');
  return content;
};
export const listEditHistory = (cruxId: string) => api().history(cruxId);
export const inspectEditCheckpoint = (cruxId: string, checkpointId: string) =>
  api().inspectCheckpoint(cruxId, checkpointId);

/** Captures only settled files; it never splits the Collaboration transcript or creates Growth. */
export async function captureEditCheckpoint(
  cruxId: string,
  reason: 'autosave' | 'safety' = 'autosave',
) {
  const content = getSqliteClient().fileContent;
  if (!content) return null;
  await settleIngestion();
  const head = await content.head(cruxId);
  return head ? content.checkpoint({ cruxId, expected: head, reason }) : null;
}

/** Both UI and agents restore through this path, including unsaved edits and disk recovery. */
export async function restoreEditCheckpoint(cruxId: string, checkpointId: string) {
  const workspace = getWorkspace(cruxId);
  await assertCopyWritable(cruxId);
  await flushNotebook(cruxId);
  if (workspace) {
    await documentsFor(workspace.data, workspace.ui).saveAll();
    await workspace.data.getState().exitSnapshotView();
  }
  await settleIngestion();
  const content = api();
  // Complete an already committed projection rather than replaying an uncertain restore.
  if (await content.finishProjection(cruxId)) {
    await workspace?.data.getState().refreshArtifacts();
    return { recovered: true };
  }
  const head = await content.head(cruxId);
  if (!head) throw new Error('This Crux has no saved file content.');
  const result = await content.restoreCheckpoint({ cruxId, expected: head, checkpointId });
  await content.finishProjection(cruxId);
  await workspace?.data.getState().refreshArtifacts();
  return result;
}
