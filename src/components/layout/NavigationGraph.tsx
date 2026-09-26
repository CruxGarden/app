import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { NavigationViewProps } from './navigation-view';
import type { GardenIdentity } from '@/stores/gardenContext';
import { safeGraphLabel } from '@/components/growth/graph-style';

/**
 * The Garden graph as a map: every Garden on this device and the Cruxes in
 * them, containment as links, the current location lit. Click a node to go
 * there. The same graph the Tree shows, drawn instead of listed; nothing is
 * read that the Tree does not read.
 */
interface GraphNode {
  id: string;
  title: string;
  kind: 'garden' | 'crux';
  depth: number;
  /** The Garden it is in (the route needs the pair). */
  gardenId: string | null;
  x?: number;
  y?: number;
}
interface GraphLink {
  source: string;
  target: string;
}

async function readGraph(graph: NavigationViewProps['graph']) {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const walk = async (garden: GardenIdentity, depth: number, parent: string | null) => {
    if (seen.has(garden.id)) return;
    seen.add(garden.id);
    nodes.push({
      id: garden.id,
      title: garden.title || 'Garden',
      kind: 'garden',
      depth,
      gardenId: parent,
    });
    if (parent) links.push({ source: parent, target: garden.id });
    // Bounded: a Garden's Cruxes come in one read; deeper Gardens recurse.
    for (const member of await graph.members(garden.id)) {
      if (member.kind === 'garden') await walk(member, depth + 1, garden.id);
      else if (!seen.has(member.id)) {
        seen.add(member.id);
        nodes.push({
          id: member.id,
          title: member.title || 'Untitled',
          kind: 'crux',
          depth: depth + 1,
          gardenId: garden.id,
        });
        links.push({ source: garden.id, target: member.id });
      }
    }
  };
  for (const root of graph.roots) await walk(root, 0, null);
  return { nodes, links };
}

export default function NavigationGraph(props: NavigationViewProps) {
  const { graph, gardenId, cruxId, navigate } = props;
  const ref = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 240, height: 320 });
  const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);
  const [error, setError] = useState('');
  const current = cruxId ?? gardenId;

  useEffect(() => {
    let cancelled = false;
    setError('');
    void readGraph(graph)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layoutKey = data?.nodes.map((n) => n.id).join('|') ?? '';
  useEffect(() => {
    const timer = requestAnimationFrame(() => ref.current?.zoomToFit(300, 40));
    return () => cancelAnimationFrame(timer);
  }, [layoutKey, size.width, size.height]);

  const accent = useMemo(
    () =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9ff3e4',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );
  const text = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e6efe9',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );

  return (
    <div
      ref={frame}
      role="region"
      aria-label="Graph"
      className="relative h-full min-h-[280px] w-full overflow-hidden rounded-lg"
    >
      {error && (
        <p role="alert" className="p-2 text-xs text-error">
          {error}
        </p>
      )}
      {data && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={ref}
          graphData={data}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTicks={120}
          autoPauseRedraw
          enableNodeDrag={false}
          minZoom={0.3}
          maxZoom={4}
          linkColor={() => 'rgba(160,190,180,0.35)'}
          linkWidth={1}
          nodeLabel={(n) => safeGraphLabel(n.title)}
          nodeVal={(n) => (n.kind === 'garden' ? 6 : 2.5)}
          nodeCanvasObject={(n, ctx, scale) => {
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            const here = n.id === current;
            const r = n.kind === 'garden' ? 6 : 3.5;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = here ? accent : n.kind === 'garden' ? 'rgba(160,190,180,0.9)' : text;
            ctx.globalAlpha = here || n.kind === 'garden' ? 1 : 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
            if (here) {
              ctx.lineWidth = 1.5 / scale;
              ctx.strokeStyle = accent;
              ctx.beginPath();
              ctx.arc(x, y, r + 4 / scale, 0, Math.PI * 2);
              ctx.stroke();
            }
            const fontSize = Math.max(10 / scale, 3);
            ctx.font = `${n.kind === 'garden' ? 600 : 400} ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = text;
            ctx.globalAlpha = here ? 1 : 0.85;
            ctx.fillText(n.title, x, y + r + 2 / scale);
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, n.kind === 'garden' ? 10 : 7, 0, Math.PI * 2);
            ctx.fill();
          }}
          onNodeClick={(n) => {
            if (n.kind === 'garden') navigate(n.id, null);
            else if (n.gardenId) navigate(n.gardenId, n.id);
          }}
        />
      )}
      <ul className="sr-only">
        {data?.nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              aria-current={n.id === current ? 'page' : undefined}
              onClick={() =>
                n.kind === 'garden'
                  ? navigate(n.id, null)
                  : n.gardenId && navigate(n.gardenId, n.id)
              }
            >
              {n.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
