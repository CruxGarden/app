import { getServices } from './index';
import { getCruxspace, type Cruxspace } from './cruxspaces';
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
  /** Every checkpoint including automatic saves, for the curious. */
  checkpoints: CruxspaceMilestone[];
  /** Lane id → member id, for navigation from any node. */
  laneOwners: Record<string, string>;
}

/** Labels the app writes on its own; they are history, not milestones of the story. */
const AUTOMATIC = [/^Checkpoint \d+$/, /^Project saved$/, /^Before task\b/, /^Before revert\b/];
const automatic = (title: string) => AUTOMATIC.some((r) => r.test(title));

export async function loadCruxspaceHistory(spaceId: string): Promise<CruxspaceHistory> {
  await flushIngestion();
  const space = await getCruxspace(spaceId);
  const { crux, artifact } = getServices();
  const live = new Map((await crux.listAll()).map((c) => [c.id, c]));
  const assets = await listCruxspaceAssets(spaceId);
  const lanes: GrowthLane[] = [];
  const nodes: GrowthNode[] = [];
  const links: GrowthLink[] = [];
  const warnings = new Set<string>();
  const laneOwners: Record<string, string> = {};
  const members: CruxspaceMember[] = [];
  const graphs = new Map<string, GrowthGraph>();

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
          origin = JSON.parse(await artifact.readContent(sidecar.id));
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
          ? outputNode(sourceGraph, origin.label, origin.imported)
          : null;
        const targetNode = firstNodeAfter(graph, lane.id, origin.imported);
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
    // The checkpoint the transfer itself took is the same event: one milestone, not two.
    const recorded = checkpoints.find(
      (m) => m.id === t.targetNodeId && m.title === `Used ${t.label} from ${space.name}` && !m.transfer,
    );
    if (recorded) {
      recorded.kind = 'transfer';
      recorded.transfer = t;
      continue;
    }
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
  const milestones = checkpoints.filter((m) => m.kind !== 'checkpoint' || !automatic(m.title));

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

/** The checkpoint that recorded the output: its labelled checkpoint, else the last Main checkpoint before the transfer. */
function outputNode(graph: GrowthGraph, label: string, before: string): GrowthNode | null {
  const main = graph.lanes.find((l) => l.phase === 'main')?.id;
  const candidates = graph.nodes
    .filter((n) => n.ownerId === main && n.kind !== 'copy' && n.created <= before)
    .sort((a, b) => a.created.localeCompare(b.created));
  return (
    [...candidates].reverse().find((n) => n.title === `Output: ${label}`) ??
    candidates.at(-1) ??
    null
  );
}
/** The first checkpoint of a lane at or after a moment: the one that holds the transferred file. */
function firstNodeAfter(graph: GrowthGraph, laneId: string, at: string): GrowthNode | null {
  return (
    graph.nodes
      .filter((n) => n.ownerId === laneId && n.kind !== 'copy' && n.created >= at)
      .sort((a, b) => a.created.localeCompare(b.created))[0] ?? null
  );
}
