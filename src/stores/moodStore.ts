import { create } from 'zustand';

/** Transient presentation only. Saved Moods are canonical API Cruxes; this
 * store owns the currently resolved image URL, never a second Mood library. */
export const useMoodStore = create<{ backgroundUrl: string | null }>(() => ({
  backgroundUrl: null,
}));
