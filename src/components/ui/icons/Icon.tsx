import type { SVGProps } from 'react';
import { ICONS, type IconName } from './icon-paths';
import { useIconSet } from './useIconSet';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'strokeWidth'> {
  /** Rendered size in px (both axes). */
  size?: number;
  /** Line set only: override the glyph's stroke width. */
  strokeWidth?: number;
}

/**
 * One glyph, drawn for the active icon set (ADR 0014). The `<svg>` carries
 * `data-icon` and `data-set` so tests and styles can see which set is live.
 * Line glyphs are strokes on a 24 grid; filled glyphs are silhouettes on the
 * same grid; pixel glyphs are integer unit squares on a 16 grid drawn crisp.
 */
export default function Icon({
  name,
  size = 16,
  strokeWidth,
  ...rest
}: IconProps & { name: IconName }) {
  const set = useIconSet();
  const g = ICONS[name];
  const common = {
    width: size,
    height: size,
    'data-icon': name,
    'data-set': set,
    'aria-hidden': true,
    ...rest,
  } as const;

  if (set === 'pixel') {
    return (
      <svg {...common} viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges">
        <path d={g.pixel} />
      </svg>
    );
  }
  if (set === 'filled') {
    return (
      <svg
        {...common}
        viewBox="0 0 24 24"
        fill="currentColor"
        fillRule={'filledRule' in g ? g.filledRule : 'nonzero'}
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      >
        <path d={g.filled} />
      </svg>
    );
  }
  const solid = 'lineFill' in g && g.lineFill;
  return (
    <svg
      {...common}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth ?? ('strokeWidth' in g ? g.strokeWidth : 1.5)}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={g.line} />
    </svg>
  );
}
