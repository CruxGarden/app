import { getServices } from './index';
import { type Cruxspace, cruxspaceMembers } from './cruxspaces';
import { listCruxspaceAssets, type AssetOrigin, type CruxspaceAsset } from './cruxspace-assets';
import {
  loadGrowthGraph,
  type GrowthGraph,
  type GrowthLane,
  type GrowthLink,
  type GrowthNode,
} from './growth-graph';
import { flushIngestion } from './ingestion';
import { toolInfo } from '@/lib/tool-info';
import { pathOf } from '@/lib/artifact-path';

/**
 * The history of a whole Cruxspace (GAME-CRUXSPACE-PLAN G10): every member's
 * Growth graph side by side in one graph, with the transfers between members
 * drawn as cross-Crux links read from the origin sidecars. A projection of
 * records that already exist (ADR 0026, ADR 0036); nothing is stored.
 */
export interface CruxspaceMember {
  id: string;
  title: string;
  /** The tool the member is made with, when known. */
  tool: string | null;
  available: boolean;
  checkpoints: number;
  tasks: number;
  outputs: CruxspaceAsset[];
  transfersIn: number;
  transfersOut: number;
}
export interface CruxspaceTransfer extends AssetOrigin {
  id: string;
  /** The member that received the output. */
  targetCruxId: string;
  targetTitle: string;
  /** Checkpoints the transfer connects, when both sides still exist. */
  sourceNodeId: string | null;
  targetNodeId: string | null;
}
export interface CruxspaceMilestone {
  id: string;
  created: string;
  cruxId: string;
  memberTitle: string;
  laneTitle: string;
  title: string;
  kind: 'checkpoint' | 'merge' | 'transfer';
  /** The checkpoint to open in the member's Whole Crux Growth. */
  nodeId: string | null;
  transfer?: CruxspaceTransfer;
}
export interface CruxspaceHistory {
  space: Cruxspace;
  members: CruxspaceMember[];
  graph: GrowthGraph;
  transfers: CruxspaceTransfer[];
  /** The steps worth walking: named checkpoints, outputs, transfers and merges. */
  milestones: CruxspaceMilestone[];
  /** Recorded Growth and transfer events; edit recovery lives separately. */
  checkpoints: CruxspaceMilestone[];
  /** Lane id → member id, for navigation from any node. */
  laneOwners: Record<string, string>;
}

export async function loadCruxspaceHistory(spaceId: string): Promise<CruxspaceHistory> {
  await flushIngestion();
  const { space, live } = await cruxspaceMembers(spaceId);
  const { artifact } = getServices();
  const assets = await listCruxspaceAssets(spaceId);
  const lanes: GrowthLane[] = [];
  const nodes: GrowthNode[] = [];
  const links: GrowthLink[] = [];
  const warnings = new Set<string>();
  const laneOwners: Record<string, string> = {};
  const members: CruxspaceMember[] = [];
  const graphs = new Map<string, GrowthGraph>();
  // Read retained manifests, never file bytes. Labels and nearby timestamps do
  // not prove that a marked version contains an output or its transfer record.
  const retained = new Map<string, ReturnType<typeof artifact.findByResource>>();
  const contains = async (node: GrowthNode, path: string, fingerprint: string) => {
    let files = retained.get(node.id);
    if (!files) {
      files = artifact.findByResource('crux', node.id);
      retained.set(node.id, files);
    }
    return (await files).some((file) => pathOf(file) === path && file.fingerprint === fingerprint);
  };
  const containingVersion = async (candidates: GrowthNode[], path: string, fingerprint: string) => {
    for (const candidate of candidates) {
      if (await contains(candidate, path, fingerprint)) return candidate;
    }
    return null;
  };

  for (const id of space.cruxIds) {
    const member = live.get(id);
    const title = member?.title || 'Untitled';
    if (!member) {
      members.push({
        id,
        title: 'Unavailable Crux',
        tool: null,
        available: false,
        checkpoints: 0,
        tasks: 0,
        outputs: [],
        transfersIn: 0,
        transfersOut: 0,
      });
      warnings.add('Some members are no longer in this Garden; their history is omitted.');
      continue;
    }
    const graph = await loadGrowthGraph(id);
    graphs.set(id, graph);
    for (const lane of graph.lanes) {
      lanes.push({ ...lane, title: lane.phase === 'main' ? title : `${title} · ${lane.title}` });
      laneOwners[lane.id] = id;
    }
    nodes.push(...graph.nodes);
    links.push(...graph.links);
    for (const w of graph.warnings) warnings.add(w);
    members.push({
      id,
      title,
      tool: toolInfo(member.meta)?.name ?? null,
      available: true,
      checkpoints: graph.nodes.filter((n) => n.kind !== 'copy').length,
      tasks: graph.lanes.length - 1,
      outputs: assets.filter((a) => a.sourceCruxId === id),
      transfersIn: 0,
      transfersOut: 0,
    });
  }

  // Transfers: origin sidecars in each member (Main and its Task lanes), one per copied file.
  const transfers: CruxspaceTransfer[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    if (!member.available) continue;
    const graph = graphs.get(member.id)!;
    for (const lane of graph.lanes) {
      const files = await artifact.findByResource('crux', lane.id);
      for (const sidecar of files.filter((f) =>
        /^cruxspace-assets\/[a-f0-9]{64}\.json$/.test(pathOf(f)),
      )) {
        if ((sidecar.size ?? 0) > 16000) continue;
        let origin: AssetOrigin;
        try {
          origin = JSON.parse(await artifact.readContent(sidecar));
        } catch {
          continue;
        }
        if (
          origin?.version !== 1 ||
          origin.spaceId !== spaceId ||
          typeof origin.sourceCruxId !== 'string' ||
          typeof origin.imported !== 'string' ||
          !Number.isFinite(Date.parse(origin.imported))
        )
          continue;
        const key = `${member.id}:${origin.path}:${origin.fingerprint}`;
        if (seen.has(key)) continue; // the same file after a merge lives in Main and the Task lane
        seen.add(key);
        const sourceGraph = graphs.get(origin.sourceCruxId);
        const sourceNode = sourceGraph
          ? await containingVersion(
              versionCandidates(sourceGraph, origin.sourceCruxId, origin.imported, 'before'),
              origin.sourcePath,
              origin.fingerprint,
            )
          : null;
        const targetNode = sidecar.fingerprint
          ? await containingVersion(
              versionCandidates(graph, lane.id, origin.imported, 'after'),
              pathOf(sidecar),
              sidecar.fingerprint,
            )
          : null;
        transfers.push({
          ...origin,
          id: `transfer:${key}`,
          targetCruxId: member.id,
          targetTitle: member.title,
          sourceNodeId: sourceNode?.id ?? null,
          targetNodeId: targetNode?.id ?? null,
        });
        member.transfersIn++;
        const source = members.find((m) => m.id === origin.sourceCruxId);
        if (source) source.transfersOut++;
      }
    }
  }
  transfers.sort((a, b) => a.imported.localeCompare(b.imported));
  for (const t of transfers) {
    if (!t.sourceNodeId || !t.targetNodeId || t.sourceNodeId === t.targetNodeId) continue;
    links.push({
      source: t.sourceNodeId,
      target: t.targetNodeId,
      kind: 'transfer',
      skipped: 0,
      label: `${t.label} → ${t.targetTitle}`,
    });
  }

  const laneTitle = new Map(lanes.map((l) => [l.id, l.title]));
  const checkpoints: CruxspaceMilestone[] = nodes
    .filter((n) => n.kind !== 'copy')
    .map((n) => ({
      id: n.id,
      created: n.created,
      cruxId: laneOwners[n.ownerId]!,
      memberTitle: live.get(laneOwners[n.ownerId]!)?.title || 'Untitled',
      laneTitle: laneTitle.get(n.ownerId) ?? '',
      title: n.title,
      kind: n.kind === 'merge' ? ('merge' as const) : ('checkpoint' as const),
      nodeId: n.id,
    }));
  for (const t of transfers) {
    checkpoints.push({
      id: t.id,
      created: t.imported,
      cruxId: t.targetCruxId,
      memberTitle: t.targetTitle,
      laneTitle: t.targetTitle,
      title: `${t.label} from ${t.sourceTitle} → ${t.path}`,
      kind: 'transfer',
      nodeId: t.targetNodeId,
      transfer: t,
    });
  }
  checkpoints.sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
  const milestones = checkpoints;

  return {
    space,
    members,
    graph: { cruxId: space.id, title: space.name, lanes, nodes, links, warnings: [...warnings] },
    transfers,
    milestones,
    checkpoints,
    laneOwners,
  };
}

/** Eligible marked versions, nearest first; the caller must verify retained content. */
function versionCandidates(
  graph: GrowthGraph,
  ownerId: string,
  at: string,
  direction: 'before' | 'after',
): GrowthNode[] {
  return graph.nodes
    .filter(
      (node) =>
        node.ownerId === ownerId &&
        node.kind !== 'copy' &&
        (direction === 'before' ? node.created <= at : node.created >= at),
    )
    .sort((a, b) =>
      direction === 'before'
        ? b.created.localeCompare(a.created)
        : a.created.localeCompare(b.created),
    );
}
