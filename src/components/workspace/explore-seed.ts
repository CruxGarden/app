import { create } from 'zustand';
import type { ExploreState } from '@/pages/Explore';

// The Explore pane is unmounted when the workspace changes (opening a result
// leaves the workspace); the search comes back with it.
let lastState: Partial<ExploreState> | undefined;

export const exploreState = {
  get: () => lastState,
  set: (state: Partial<ExploreState>) => {
    lastState = state;
  },
};

/** Bumped when a search is handed in from outside, so Explore starts over with it. */
export const useExploreSeed = create<{ n: number }>(() => ({ n: 0 }));

/** Start Explore on a search (the command palette's "Search Explore for …"). */
export function seedExplore(q: string) {
  lastState = { q, page: 1 };
  useExploreSeed.setState((s) => ({ n: s.n + 1 }));
}
