import type { GrowthNode } from '@/services/growth-graph';

export const laneColors = ['#8ecb94', '#73bfc9', '#dfb56f', '#b4a0df', '#df94ab', '#a9c76d'];
export const laneColor = (lane: number) => laneColors[lane % laneColors.length]!;
export function safeGraphLabel(text: string) {
  // The library interprets tooltip strings as HTML. Task names are ordinary untrusted text.
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]!,
  );
}
export type RenderNode = GrowthNode & {
  lane: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  z: number;
  fz: number;
};
export const endpointId = (endpoint: string | number | { id?: string | number } | undefined) =>
  typeof endpoint === 'object' ? String(endpoint.id) : String(endpoint);

export interface GraphCanvasProps {
  graph: import('@/services/growth-graph').GrowthGraph;
  width: number;
  height: number;
  selectedId: string | null;
  ancestry: ReadonlySet<string>;
  onSelect: (id: string) => void;
  fit: number;
  reducedMotion: boolean;
}
