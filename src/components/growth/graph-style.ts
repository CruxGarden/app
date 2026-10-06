import type { GrowthLink, GrowthNode } from '@/services/growth-graph';

export interface GraphAppearance {
  background: string;
  text: string;
  textMuted: string;
  selected: string;
  selectionWidth: number;
  lanes: readonly string[];
  link: string;
  mergeLink: string;
  transferLink: string;
  inactive: string;
  fontFamily: string;
  fontWeight: string;
  letterSpacing: string;
  labelSize: number;
  motion: { base: number; slow: number };
}
export const laneColor = (appearance: GraphAppearance, lane: number) =>
  appearance.lanes[lane % appearance.lanes.length]!;
export function graphLinkColor(
  appearance: GraphAppearance,
  link: GrowthLink,
  selectedId: string | null,
  ancestry: ReadonlySet<string>,
) {
  return selectedId && !ancestry.has(endpointId(link.target))
    ? appearance.inactive
    : link.kind === 'merge'
      ? appearance.mergeLink
      : link.kind === 'transfer'
        ? appearance.transferLink
        : appearance.link;
}
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
  appearance: GraphAppearance;
}
