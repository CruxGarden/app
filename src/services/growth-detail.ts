import type { ChatMessage } from '@/api/types';
import { getSqliteClient } from './sqlite/client';
import { getServices } from './index';
import { checkpointFiles, type CheckpointFile } from './checkpoint-files';
import type { GrowthNode } from './growth-graph';

/** Selection loads only that checkpoint; retained states never resolve through mutable Main. */
export async function loadGrowthDetail(node: GrowthNode): Promise<{
  artifacts: CheckpointFile[];
  messages: ChatMessage[];
  summary?: string;
  data?: string;
}> {
  if (node.retained) {
    const inspect = getSqliteClient().inspectTaskHistory;
    if (!inspect) throw new Error('Task history inspection is unavailable.');
    const state = await inspect(node.retained.selection);
    if (state.root !== node.retained.root)
      throw new Error('The selected Task history changed; reopen it.');
    return {
      messages: state.workspace.messages as ChatMessage[],
      artifacts: state.entries.map((entry) => ({
        ...entry,
        source: {
          kind: 'task-history',
          selection: node.retained!.selection,
          root: state.root,
          path: entry.path,
        },
      })),
    };
  }
  const { crux, dimension } = getServices();
  const [snapshot, artifacts, growth] = await Promise.all([
    crux.findById(node.id),
    checkpointFiles(node.id),
    node.dimensionId ? dimension.findById(node.dimensionId) : Promise.resolve(null),
  ]);
  return {
    artifacts,
    messages: (snapshot.meta?.messages ?? []) as ChatMessage[],
    data: snapshot.data,
    summary: typeof growth?.meta?.summary === 'string' ? growth.meta.summary : undefined,
  };
}
