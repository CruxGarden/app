import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { moodTimeline, revealAlpha, setPieceAllowed } from '@/lib/set-piece';
import { layoutGrowthGraph, type GrowthLink } from '@/services/growth-graph';
import {
  endpointId,
  laneColor,
  safeGraphLabel,
  type GraphCanvasProps,
  type RenderNode,
} from './graph-style';

export default function GrowthGraphCanvas({
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
  const data = useMemo(() => layoutGrowthGraph(graph), [graph]);
  const layoutKey = graph.nodes.map((n) => n.id).join('|');
  // The reveal (a set piece, ADR 0041): checkpoints arrive in time order on a
  // GSAP tween over the Mood's slow duration; nothing under reduced motion or
  // an intensity below normal — the graph is simply there.
  const reveal = useRef(1);
  const order = useMemo(() => new Map(data.nodes.map((n, i) => [n.id, i])), [data]);
  const [revealed, setRevealed] = useState<'playing' | 'done'>('done');
  useEffect(() => {
    if (reducedMotion || !setPieceAllowed()) {
      reveal.current = 1;
      setRevealed('done');
      return;
    }
    reveal.current = 0;
    setRevealed('playing');
    const { timeline, tokens } = moodTimeline({
      // autoPauseRedraw stops the render loop once the engine is cold; resuming it paints a frame
      onUpdate: () => ref.current?.resumeAnimation(),
      onComplete: () => setRevealed('done'),
    });
    timeline.to(reveal, { current: 1, duration: (tokens.slow * 3) / 1000 });
    return () => {
      timeline.kill();
      reveal.current = 1;
    };
  }, [layoutKey, reducedMotion]);
  useEffect(() => {
    const timer = requestAnimationFrame(() => ref.current?.zoomToFit(0, 65));
    return () => cancelAnimationFrame(timer);
  }, [layoutKey, width, height, fit]);
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
    <div data-growth-reveal={revealed} className="contents">
      <ForceGraph2D<RenderNode, GrowthLink>
        ref={ref}
        graphData={data}
        width={width}
        height={height}
        backgroundColor="#101c19"
        cooldownTicks={0}
        autoPauseRedraw
        enableNodeDrag={false}
        minZoom={0.04}
        maxZoom={5}
        nodeLabel={(n) => safeGraphLabel(`${graph.lanes[n.lane]?.title} · ${n.title}`)}
        nodeVal={(n) => (n.kind === 'copy' ? 5 : 3)}
        nodeCanvasObject={(n, ctx, scale) => {
          const active = !selectedId || ancestry.has(n.id);
          const selected = n.id === selectedId;
          const arrived = revealAlpha(reveal.current, order.get(n.id) ?? 0, data.nodes.length);
          if (arrived <= 0) return;
          ctx.globalAlpha = (active ? 1 : 0.28) * arrived;
          const radius = selected ? 9 : n.kind === 'copy' ? 8 : 5;
          ctx.fillStyle = laneColor(n.lane);
          ctx.strokeStyle = selected ? '#ffffff' : laneColor(n.lane);
          ctx.lineWidth = selected ? 2 : 1;
          ctx.beginPath();
          if (n.kind === 'merge') {
            ctx.moveTo(n.x, n.y - radius * 1.5);
            ctx.lineTo(n.x + radius * 1.5, n.y);
            ctx.lineTo(n.x, n.y + radius * 1.5);
            ctx.lineTo(n.x - radius * 1.5, n.y);
            ctx.closePath();
          } else ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
          if (n.kind !== 'copy') ctx.fill();
          ctx.stroke();
          const fontSize = Math.min(18, 11 / scale);
          ctx.font = `${fontSize}px "Outfit", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#e1eee5';
          const label = n.title.length > 30 ? `${n.title.slice(0, 29)}…` : n.title;
          ctx.fillText(label, n.x, n.y + radius + 5);
          ctx.globalAlpha = 1;
        }}
        linkVisibility={(l) =>
          revealAlpha(reveal.current, order.get(endpointId(l.target)) ?? 0, data.nodes.length) >= 1
        }
        linkColor={(l) =>
          selectedId && !ancestry.has(endpointId(l.target))
            ? '#293831'
            : l.kind === 'merge'
              ? '#dfb56f'
              : l.kind === 'transfer'
                ? '#df94ab'
                : '#648374'
        }
        linkWidth={(l) => (l.kind === 'merge' || l.kind === 'transfer' ? 2 : 1)}
        linkLineDash={(l) =>
          l.skipped ? [4, 3] : l.kind === 'copy' ? [2, 3] : l.kind === 'transfer' ? [7, 4] : null
        }
        linkLabel={(l) =>
          l.skipped
            ? `${l.skipped} collapsed checkpoints`
            : l.kind === 'merge'
              ? 'Merged into Main'
              : l.kind === 'transfer'
                ? safeGraphLabel(`Used ${l.label ?? 'an output'}`)
                : ''
        }
        linkDirectionalArrowLength={5}
        linkDirectionalArrowRelPos={0.8}
        onNodeClick={(n) => {
          onSelect(n.id);
          ref.current?.centerAt(n.x, n.y, reducedMotion ? 0 : 250);
        }}
        onBackgroundClick={() => onSelect('')}
      />
    </div>
  );
}
