import { useEffect, useMemo, useRef } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import { layoutGrowthGraph, type GrowthLink } from '@/services/growth-graph';
import {
  endpointId,
  laneColor,
  safeGraphLabel,
  type GraphCanvasProps,
  type RenderNode,
} from './graph-style';

export default function GrowthGraph3D({
  graph,
  width,
  height,
  selectedId,
  ancestry,
  onSelect,
  fit,
  reducedMotion,
}: GraphCanvasProps) {
  const ref = useRef<ForceGraphMethods<RenderNode, GrowthLink> | undefined>(undefined);
  const data = useMemo(() => {
    const layout = layoutGrowthGraph(graph);
    // The renderer fits around the world origin, not the bounds' midpoint.
    // Center our fixed lanes so the initial view includes every branch at a useful scale.
    const bounds = layout.nodes.reduce(
      (box, n) => ({
        minX: Math.min(box.minX, n.x),
        maxX: Math.max(box.maxX, n.x),
        minY: Math.min(box.minY, n.y),
        maxY: Math.max(box.maxY, n.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    const centerX = layout.nodes.length ? (bounds.minX + bounds.maxX) / 2 : 0;
    const centerY = layout.nodes.length ? (bounds.minY + bounds.maxY) / 2 : 0;
    // Stable time and lane axes, with depth separating the task branches.
    return {
      ...layout,
      nodes: layout.nodes.map((n) => ({
        ...n,
        x: n.x - centerX,
        fx: n.fx - centerX,
        y: centerY - n.y,
        fy: centerY - n.fy,
        z: n.lane === 0 ? 0 : (n.lane % 2 ? 1 : -1) * 90,
        fz: n.lane === 0 ? 0 : (n.lane % 2 ? 1 : -1) * 90,
      })),
    };
  }, [graph]);
  const layoutKey = graph.nodes.map((n) => n.id).join('|');
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.zoomToFit(reducedMotion ? 0 : 400, 70), 100);
    return () => clearTimeout(timer);
  }, [layoutKey, width, height, fit, reducedMotion]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) ref.current?.pauseAnimation();
      else ref.current?.resumeAnimation();
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  return (
    <ForceGraph3D<RenderNode, GrowthLink>
      ref={ref}
      graphData={data}
      width={width}
      height={height}
      backgroundColor="#101c19"
      showNavInfo={false}
      cooldownTicks={0}
      enableNodeDrag={false}
      nodeResolution={8}
      nodeRelSize={6}
      nodeLabel={(n) =>
        safeGraphLabel(
          `${graph.lanes[n.lane]?.title} · ${n.title}${n.kind === 'merge' ? ' · Merge' : ''}`,
        )
      }
      nodeColor={(n) => (selectedId && !ancestry.has(n.id) ? '#34483f' : laneColor(n.lane))}
      nodeVal={(n) =>
        n.id === selectedId ? 8 : n.kind === 'copy' ? 5 : n.kind === 'merge' ? 4 : 2
      }
      linkColor={(l) =>
        selectedId && !ancestry.has(endpointId(l.target))
          ? '#293831'
          : l.kind === 'merge'
            ? '#dfb56f'
            : '#648374'
      }
      linkWidth={(l) => (l.kind === 'merge' ? 1.6 : 0.7)}
      linkOpacity={0.8}
      linkDirectionalArrowLength={5}
      linkDirectionalArrowRelPos={0.8}
      onNodeClick={(n) => {
        onSelect(n.id);
        ref.current?.cameraPosition(
          { x: n.x + 90, y: n.y + 40, z: n.z + 260 },
          n,
          reducedMotion ? 0 : 450,
        );
      }}
      onBackgroundClick={() => onSelect('')}
    />
  );
}
