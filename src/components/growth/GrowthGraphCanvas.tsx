import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { moodTimeline, revealAlpha, setPieceAllowed } from '@/lib/set-piece';
import { layoutGrowthGraph, type GrowthLink } from '@/services/growth-graph';
import {
  endpointId,
  graphLinkColor,
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
  appearance,
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
  }, [layoutKey, reducedMotion, appearance.motion.slow]);
  useEffect(() => {
    ref.current?.resumeAnimation();
  }, [appearance]);
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
        backgroundColor="transparent"
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
          // Only the temporary reveal changes opacity; the Mood owns resting RGBA.
          ctx.globalAlpha = arrived;
          const radius = selected ? 9 : n.kind === 'copy' ? 8 : 5;
          const color = active ? laneColor(appearance, n.lane) : appearance.inactive;
          ctx.fillStyle = color;
          ctx.strokeStyle = selected ? appearance.selected : color;
          ctx.lineWidth = selected ? appearance.selectionWidth / scale : 1;
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
          const fontSize = Math.min(appearance.labelSize * (18 / 11), appearance.labelSize / scale);
          ctx.font = `${appearance.fontWeight} ${fontSize}px ${appearance.fontFamily}`;
          ctx.letterSpacing = appearance.letterSpacing;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = active ? appearance.text : appearance.textMuted;
          let label = n.title;
          // Keep labels inside their lane; the inspector and tooltip retain
          // the complete title at every zoom level.
          while (label.length > 1 && ctx.measureText(label).width > 160)
            label = `${label.replace(/…$/, '').slice(0, -1)}…`;
          ctx.fillText(label, n.x, n.y + radius + 5);
          ctx.globalAlpha = 1;
        }}
        linkVisibility={(l) =>
          revealAlpha(reveal.current, order.get(endpointId(l.target)) ?? 0, data.nodes.length) >= 1
        }
        linkColor={(l) => graphLinkColor(appearance, l, selectedId, ancestry)}
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
          ref.current?.centerAt(n.x, n.y, reducedMotion ? 0 : appearance.motion.base);
        }}
        onBackgroundClick={() => onSelect('')}
      />
    </div>
  );
}
