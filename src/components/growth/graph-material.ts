import { MeshLambertMaterial } from 'three';
import { editableColor } from '@/lib/moods/color-controls';

/** The engine multiplies directional-arrow alpha by linkOpacity * 3.
 * Links use our own material below; this cancels only that engine factor,
 * so nodes, lines and arrows all retain the Mood color's chosen alpha. */
export const GRAPH_ARROW_OPACITY = 1 / 3;

export function graphLinkMaterial(color: string): MeshLambertMaterial {
  const parsed = editableColor(color);
  const opacity = parsed?.alpha ?? 1;
  return new MeshLambertMaterial({
    color: parsed?.hex ?? color,
    opacity,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
  });
}
