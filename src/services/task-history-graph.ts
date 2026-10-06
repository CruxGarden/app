import type { TaskHistorySelection } from '@cruxgarden/local-api';
import { getSqliteClient } from './sqlite/client';
import type { GrowthLane, GrowthNode } from './growth-graph';

export const taskHistoryNodeId = (id: string, part: TaskHistorySelection['part']) =>
  `task-history:${id}:${part}`;
interface StateMetadata {
  root: string;
  parentId: string | null;
}
interface BaseRow extends StateMetadata {
  id: string;
  title: string;
  sourceId: string | null;
  priorMergeId: string | null;
  created: string;
}
interface MergeRow {
  id: string;
  copyId: string;
  targetId: string;
  title: string;
  created: string;
  source: string;
  target: string;
  result: string;
}

/** Metadata-only projection of existing retention. Never reads file bytes or transcripts,
 * and never manufactures Growth versions to represent Task lifecycle events. */
export async function projectTaskHistory(
  cruxId: string,
  lanes: GrowthLane[],
  snapshots: GrowthNode[],
) {
  const db = getSqliteClient();
  const bases = await db.all<BaseRow>(
    `SELECT id, title, created,
    json_extract(base_state, '$.sourceId') AS sourceId,
    json_extract(base_state, '$.root') AS root,
    json_extract(base_state, '$.workspace.parentId') AS parentId,
    (SELECT json_extract(m.value, '$.taskMergeId') FROM json_each(base_state, '$.workspace.messages') m
      WHERE json_extract(m.value, '$.taskMergeId') IS NOT NULL ORDER BY m.key DESC LIMIT 1) AS priorMergeId
    FROM working_copies WHERE crux_id = ? AND role = 'task' ORDER BY created, id`,
    [cruxId],
  );
  const metadata = (
    part: string,
  ) => `json_object('root', json_extract(m.data, '$.${part}State.root'),
    'parentId', json_extract(m.data, '$.${part}State.workspace.parentId'))`;
  const merges = await db.all<MergeRow>(
    `SELECT m.id, m.copy_id AS copyId, c.title, m.created,
    COALESCE(json_extract(m.data, '$.targetId'), m.crux_id) AS targetId,
    ${metadata('source')} AS source, ${metadata('target')} AS target, ${metadata('result')} AS result
    FROM task_merges m JOIN working_copies c ON c.id = m.copy_id AND c.crux_id = m.crux_id AND c.role = 'task'
    WHERE m.crux_id = ? AND m.phase = 'merged' ORDER BY m.created, m.id`,
    [cruxId],
  );
  const nodes: GrowthNode[] = [...snapshots];
  const retainedByContext = new Map<string, string>();
  const contextKey = (ownerId: string, root: string, parentId: string | null) =>
    JSON.stringify([ownerId, root, parentId]);
  const prior = (ownerId: string, state: StateMetadata) =>
    retainedByContext.get(contextKey(ownerId, state.root, state.parentId)) ?? state.parentId;
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const add = (input: {
    id: string;
    part: TaskHistorySelection['part'];
    ownerId: string;
    title: string;
    created: string;
    state: StateMetadata;
    sourceId?: string;
    targetId?: string;
  }) => {
    const { id, part, ownerId, title, created, state } = input;
    if (!state.root) throw new Error('Retained Task history is missing its content root.');
    const node: GrowthNode = {
      id: taskHistoryNodeId(id, part),
      ownerId,
      title,
      created,
      kind: part === 'result' ? 'merge' : 'state',
      parentId: part === 'result' ? state.parentId : prior(ownerId, state),
      mergeSourceId: input.sourceId ?? null,
      mergeTargetId: input.targetId ?? null,
      retained: { selection: { cruxId, id, part }, root: state.root, parentId: state.parentId },
    };
    nodes.push(node);
    retainedByContext.set(contextKey(ownerId, state.root, state.parentId), node.id);
    return node;
  };
  for (const base of bases) {
    const node = add({
      id: base.id,
      part: 'base',
      ownerId: base.id,
      title: `${base.title} started`,
      created: base.created,
      state: base,
    });
    node.parentId = prior(base.sourceId ?? cruxId, base);
    laneById.get(base.id)!.baseId = node.id;
  }
  for (const merge of merges) {
    const source = add({
      id: merge.id,
      part: 'source',
      ownerId: merge.copyId,
      title: `${merge.title} before merge`,
      created: merge.created,
      state: JSON.parse(merge.source) as StateMetadata,
    });
    if (!source.parentId) source.parentId = laneById.get(merge.copyId)?.baseId ?? null;
    const target = add({
      id: merge.id,
      part: 'target',
      ownerId: merge.targetId,
      title: `Before merging ${merge.title}`,
      created: merge.created,
      state: JSON.parse(merge.target) as StateMetadata,
    });
    add({
      id: merge.id,
      part: 'result',
      ownerId: merge.targetId,
      title: `Merged ${merge.title}`,
      created: merge.created,
      state: JSON.parse(merge.result) as StateMetadata,
      sourceId: source.id,
      targetId: target.id,
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const base of bases) {
    const result = base.priorMergeId && byId.get(taskHistoryNodeId(base.priorMergeId, 'result'));
    if (
      result &&
      result.ownerId === (base.sourceId ?? cruxId) &&
      result.retained?.parentId === base.parentId
    )
      byId.get(taskHistoryNodeId(base.id, 'base'))!.parentId = result.id;
  }
  for (const node of snapshots) {
    const mergeId = node.retainedMergeId && taskHistoryNodeId(node.retainedMergeId, 'result');
    if (mergeId && byId.has(mergeId) && byId.get(mergeId)?.ownerId === node.ownerId)
      node.parentId = mergeId;
    delete node.retainedMergeId;
  }
  // A retained result is the tip only while its summary remains in the current
  // segment. An explicit empty restored branch must not reconnect to old merges.
  const tips = await db.all<{ id: string; mergeId: string | null }>(
    `
    SELECT id, (SELECT json_extract(m.value, '$.taskMergeId') FROM json_each(meta, '$.messages') m
      WHERE json_extract(m.value, '$.taskMergeId') IS NOT NULL ORDER BY m.key DESC LIMIT 1) AS mergeId
    FROM cruxes WHERE id = ? UNION ALL
    SELECT id, COALESCE((SELECT json_extract(m.value, '$.taskMergeId') FROM json_each(meta, '$.messages') m
      WHERE json_extract(m.value, '$.taskMergeId') IS NOT NULL ORDER BY m.key DESC LIMIT 1),
      (SELECT id FROM task_merges WHERE copy_id = working_copies.id AND phase = 'merged' ORDER BY created DESC, id DESC LIMIT 1)) AS mergeId
    FROM working_copies WHERE crux_id = ? AND role = 'task'`,
    [cruxId, cruxId],
  );
  const tipByOwner = new Map(tips.map((tip) => [tip.id, tip.mergeId]));
  for (const lane of lanes) {
    const mergeId = tipByOwner.get(lane.id);
    const part = lane.phase === 'merged' ? 'source' : 'result';
    const retained = mergeId ? byId.get(taskHistoryNodeId(mergeId, part)) : undefined;
    if (retained?.ownerId === lane.id && retained.retained?.parentId === lane.headId) {
      lane.headId = retained.id;
      lane.headSelected = true;
    } else if (
      !lane.headId &&
      (!lane.headSelected || (lane.id !== cruxId && !snapshots.some((n) => n.ownerId === lane.id)))
    ) {
      lane.headId = lane.baseId;
      lane.headSelected = true;
    }
  }
  return { lanes, nodes };
}
