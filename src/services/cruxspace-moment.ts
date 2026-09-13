import { getSetting, setSetting, removeSetting } from './settings';
import type { Dimension } from '@/api/types';

/**
 * A moment in a Cruxspace's history that a person is walking through (G10):
 * every member Crux opens read-only at its last checkpoint at or before `at`.
 * One moment at a time, kept in settings so it survives navigation and restart.
 */
export interface CruxspaceMoment {
  spaceId: string;
  spaceName: string;
  milestoneId: string;
  title: string;
  at: string;
  step: number;
  steps: number;
}
const KEY = 'cruxgarden:cruxspace-moment';
export const CRUXSPACE_MOMENT_CHANGED = 'cruxspace-moment:changed';

export function getCruxspaceMoment(): CruxspaceMoment | null {
  const raw = getSetting(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CruxspaceMoment;
    return typeof value?.spaceId === 'string' && typeof value.at === 'string' ? value : null;
  } catch {
    return null;
  }
}
export function setCruxspaceMoment(moment: CruxspaceMoment | null): void {
  if (moment) setSetting(KEY, JSON.stringify(moment));
  else removeSetting(KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CRUXSPACE_MOMENT_CHANGED));
}

/** The snapshot a member shows at a moment: its last Growth entry created at or before `at`. */
export function snapshotIndexAt(growths: Dimension[], at: string): number | null {
  let index: number | null = null;
  growths.forEach((g, i) => {
    if (g.created <= at) index = i;
  });
  return index;
}
