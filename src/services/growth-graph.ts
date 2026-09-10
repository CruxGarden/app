import { getSqliteClient } from './sqlite/client';

export interface GrowthLane {
  id: string;
  title: string;
  phase: string;
  baseId: string | null;
  headId: string | null;
}
export interface GrowthNode {
  id: string;
  dimensionId?: string;
  ownerId: string;
  title: string;
  created: string;
  kind: 'snapshot' | 'merge' | 'copy';
  parentId: string | null;
  mergeSourceId: string | null;
  mergeTargetId: string | null;
}
export interface GrowthLink {
  source: string;
  target: string;
  kind: 'history' | 'merge' | 'copy';
  skipped: number;
}
export interface GrowthGraph {
  cruxId: string;
  title: string;
  lanes: GrowthLane[];
  nodes: GrowthNode[];
  links: GrowthLink[];
  warnings: string[];
}

/** A read-only projection. Never load Artifact bytes, conversations or provider state here. */
export async function loadGrowthGraph(cruxId: string): Promise<GrowthGraph> {
  const db = getSqliteClient();
  const main = await db.get<{ id: string; title: string; headId: string | null }>(
    `SELECT id, title, json_extract(meta, '$.settings.activeBranch') AS headId
     FROM cruxes WHERE id = ? AND deleted IS NULL AND (kind IS NULL OR kind != 'snapshot')`,
    [cruxId],
  );
  if (!main) throw new Error('This Crux is no longer available.');
  const tasks = await db.all<GrowthLane>(
    `SELECT id, title, phase, base_snapshot_id AS baseId,
       json_extract(meta, '$.settings.activeBranch') AS headId
     FROM working_copies WHERE crux_id = ? AND role = 'task' ORDER BY created, id`,
    [cruxId],
  );
  const lanes: GrowthLane[] = [
    { id: main.id, title: 'Main', phase: 'main', baseId: null, headId: main.headId },
    ...tasks,
  ];
  // Scope by durable content ownership, including archived/merged Tasks, excluding review folders.
  const snapshots = await db.all<GrowthNode>(
    `SELECT s.id, d.id AS dimensionId, d.source_id AS ownerId,
       COALESCE(json_extract(d.meta, '$.label'), 'Checkpoint ' || CAST(d.weight AS INTEGER), s.title, 'Checkpoint') AS title,
       d.created, 'snapshot' AS kind,
       json_extract(s.meta, '$.parentCruxId') AS parentId,
       json_extract(s.meta, '$.merge.sourceHead') AS mergeSourceId,
       json_extract(s.meta, '$.merge.targetHead') AS mergeTargetId
     FROM dimensions d JOIN cruxes s ON s.id = d.target_id
     WHERE d.type = 'growth' AND (d.source_id = ? OR d.source_id IN (
       SELECT id FROM working_copies WHERE crux_id = ? AND role = 'task'
     )) ORDER BY d.created, d.weight, d.id`,
    [cruxId, cruxId],
  );
  return buildGrowthGraph(main.id, main.title, lanes, snapshots);
}

export function buildGrowthGraph(
  cruxId: string,
  title: string,
  lanes: GrowthLane[],
  snapshots: GrowthNode[],
): GrowthGraph {
  const owners = new Set(lanes.map((l) => l.id));
  const nodes: GrowthNode[] = [
    ...new Map(
      snapshots
        .filter((n) => owners.has(n.ownerId))
        .map((n) => [
          n.id,
          {
            ...n,
            kind: n.mergeSourceId ? ('merge' as const) : ('snapshot' as const),
          },
        ]),
    ).values(),
  ];
  const ids = new Set(nodes.map((n) => n.id));
  const links: GrowthLink[] = [];
  const linkIndex = new Map<string, GrowthLink>();
  const latestByOwner = new Map(nodes.map((n) => [n.ownerId, n.id]));
  const warnings = new Set<string>();
  const add = (source: string | null, target: string, kind: GrowthLink['kind']) => {
    if (!source) return;
    if (!ids.has(source)) {
      warnings.add('Some referenced checkpoints are unavailable; their connections are omitted.');
      return;
    }
    if (source === target) {
      warnings.add('A checkpoint references itself; that connection is omitted.');
      return;
    }
    const key = `${source}:${target}`;
    const existing = linkIndex.get(key);
    if (existing) {
      if (kind === 'merge') existing.kind = kind;
    } else {
      const link = { source, target, kind, skipped: 0 };
      links.push(link);
      linkIndex.set(key, link);
    }
  };
  for (const node of nodes) {
    add(node.parentId, node.id, 'history');
    add(node.mergeTargetId, node.id, 'history');
    add(node.mergeSourceId, node.id, 'merge');
  }
  for (const lane of lanes) {
    const fallback = latestByOwner.get(lane.id) ?? lane.baseId;
    const head = lane.headId ?? fallback;
    const id = `copy:${lane.id}`;
    nodes.push({
      id,
      ownerId: lane.id,
      title: lane.title,
      created: '',
      kind: 'copy',
      parentId: head,
      mergeSourceId: null,
      mergeTargetId: null,
    });
    ids.add(id);
    add(head, id, 'copy');
  }
  return { cruxId, title, lanes, nodes, links, warnings: [...warnings] };
}

/** Collapse only linear interiors; origins, heads, forks, merges and selection remain visible. */
export function compactGrowthGraph(
  graph: GrowthGraph,
  expandedLanes: ReadonlySet<string>,
  selectedId?: string | null,
): GrowthGraph {
  const incoming = new Map<string, GrowthLink[]>();
  const outgoing = new Map<string, GrowthLink[]>();
  for (const link of graph.links) {
    incoming.set(link.target, [...(incoming.get(link.target) ?? []), link]);
    outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link]);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const anchors = new Set(graph.lanes.flatMap((l) => [l.baseId, l.headId]).filter(Boolean));
  const hidden = new Set(
    graph.nodes
      .filter((n) => {
        const before = incoming.get(n.id) ?? [];
        const after = outgoing.get(n.id) ?? [];
        return (
          !expandedLanes.has(n.ownerId) &&
          n.id !== selectedId &&
          !anchors.has(n.id) &&
          n.kind === 'snapshot' &&
          before.length === 1 &&
          after.length === 1 &&
          before[0]!.kind === 'history' &&
          after[0]!.kind === 'history' &&
          byId.get(before[0]!.source)?.ownerId === n.ownerId &&
          byId.get(after[0]!.target)?.ownerId === n.ownerId
        );
      })
      .map((n) => n.id),
  );
  const links: GrowthLink[] = [];
  for (const link of graph.links) {
    if (hidden.has(link.target)) continue;
    let source = link.source;
    let skipped = 0;
    const seen = new Set<string>();
    while (hidden.has(source) && !seen.has(source)) {
      seen.add(source);
      source = incoming.get(source)![0]!.source;
      skipped++;
    }
    if (!hidden.has(source)) links.push({ ...link, source, skipped });
  }
  return { ...graph, nodes: graph.nodes.filter((n) => !hidden.has(n.id)), links };
}

/** Stable depth and lane coordinates; force renderers must mutate only these disposable copies. */
export function layoutGrowthGraph(graph: GrowthGraph) {
  const indegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  const children = new Map<string, string[]>();
  const depths = new Map<string, number>();
  for (const l of graph.links) {
    indegree.set(l.target, (indegree.get(l.target) ?? 0) + 1);
    children.set(l.source, [...(children.get(l.source) ?? []), l.target]);
  }
  const queue = graph.nodes.filter((n) => !indegree.get(n.id)).map((n) => n.id);
  for (const root of queue) depths.set(root, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const child of children.get(id) ?? []) {
      depths.set(child, Math.max(depths.get(child) ?? 0, (depths.get(id) ?? 0) + 1));
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  const laneIndices = new Map(graph.lanes.map((l, i) => [l.id, i]));
  const occupied = new Map<string, number>();
  return {
    cyclic: queue.length !== graph.nodes.length,
    nodes: graph.nodes.map((n, i) => {
      const lane = laneIndices.get(n.ownerId) ?? 0;
      const depth = depths.get(n.id) ?? i;
      const key = `${lane}:${depth}`;
      const offset = occupied.get(key) ?? 0;
      occupied.set(key, offset + 1);
      return {
        ...n,
        lane,
        x: lane * 200 + offset * 65,
        y: depth * 90,
        fx: lane * 200 + offset * 65,
        fy: depth * 90,
        z: 0,
        fz: 0,
      };
    }),
    links: graph.links.map((l) => ({ ...l })),
  };
}

export function growthAncestry(graph: GrowthGraph, id: string): Set<string> {
  const parents = new Map<string, string[]>();
  for (const l of graph.links) parents.set(l.target, [...(parents.get(l.target) ?? []), l.source]);
  const found = new Set<string>();
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    const next = queue[i]!;
    if (found.has(next)) continue;
    found.add(next);
    queue.push(...(parents.get(next) ?? []));
  }
  return found;
}
