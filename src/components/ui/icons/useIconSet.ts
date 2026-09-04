import { useSyncExternalStore } from 'react';
import {
  currentIconSet,
  DEFAULT_ICON_SET,
  ICON_SET_EVENT,
  type IconSet,
} from '@/lib/moods/icon-set';

function subscribe(cb: () => void): () => void {
  document.addEventListener(ICON_SET_EVENT, cb);
  return () => document.removeEventListener(ICON_SET_EVENT, cb);
}

const server = (): IconSet => DEFAULT_ICON_SET;

/**
 * The active icon set. Reads `<html data-icon-set>`, which the theme applier
 * keeps in step with the `iconSet` token, and re-renders on its event — no
 * observer, no context provider.
 */
export function useIconSet(): IconSet {
  return useSyncExternalStore(subscribe, currentIconSet, server);
}
