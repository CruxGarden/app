import { useMemo } from 'react';
import { compactGrowthGraph, growthAncestry, type GrowthGraph } from '@/services/growth-graph';

/**
 * The drawn form of a Growth graph: compacted to the lanes that are open,
 * with the selected node's ancestry lit. The Whole Crux Growth explorer and
 * the Garden history draw the same view.
 */
export function useGrowthGraphView(
  graph: GrowthGraph | null,
  expanded: boolean,
  selectedId: string | null,
) {
  const display = useMemo(
    () =>
      graph
        ? compactGrowthGraph(
            graph,
            new Set(expanded ? graph.lanes.map((l) => l.id) : []),
            selectedId,
          )
        : null,
    [graph, expanded, selectedId],
  );
  const ancestry = useMemo(
    () => (graph && selectedId ? growthAncestry(graph, selectedId) : new Set<string>()),
    [graph, selectedId],
  );
  const selected = graph?.nodes.find((n) => n.id === selectedId) ?? null;
  return { display, ancestry, selected };
}
