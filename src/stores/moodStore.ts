import { create } from 'zustand';
import type { Crux } from '@/api/types';
import type { BgType } from '@/lib/types';
import { applyMoodPalette, type MoodPalette } from '@/lib/moods';
import { getServices } from '@/services';
import { getSetting, setSetting } from '@/services/settings';
import { BG_CSS_VAR, SettingsKey } from '@/lib/constants';

/**
 * MoodMeta — the meta shape for a mood crux (type: 'mood').
 */
export interface MoodPersona {
  name: string;
  description: string;
  systemPrompt: string;
  greeting: string;
}

export interface MoodMeta {
  palette?: Partial<MoodPalette>;
  backgroundType?: BgType;
  themeMode?: 'dark' | 'light' | null;
  persona?: MoodPersona;
  tags?: string[];
}

interface MoodState {
  // Active mood
  activeMoodId: string | null;
  activeMood: Crux | null;
  avatarUrl: string | null;
  backgroundUrl: string | null;

  // Library
  moods: Crux[];
  loaded: boolean;

  // Actions
  loadMoods: () => Promise<void>;
  setActiveMood: (moodId: string | null) => Promise<void>;
  createMood: (title: string) => Promise<Crux>;
  updateMood: (moodId: string, meta: Partial<MoodMeta>) => Promise<Crux>;
  deleteMood: (moodId: string) => Promise<void>;
  applyMood: (mood: Crux | null) => void;
}

/**
 * Load avatar and background blob URLs from a mood's artifacts.
 */
async function loadMoodArtifacts(moodId: string): Promise<{ avatarUrl: string | null; backgroundUrl: string | null }> {
  try {
    const { artifact } = getServices();
    const artifacts = await artifact.findByResource('crux', moodId);

    let avatarUrl: string | null = null;
    let backgroundUrl: string | null = null;

    const avatarArt = artifacts.find((a) => a.meta?.path === 'avatar.png' || a.meta?.path === 'avatar.jpg');
    if (avatarArt) {
      const blob = await artifact.downloadBlob(avatarArt.id);
      avatarUrl = URL.createObjectURL(blob);
    }

    const bgArt = artifacts.find((a) => a.meta?.path === 'background.png' || a.meta?.path === 'background.jpg');
    if (bgArt) {
      const blob = await artifact.downloadBlob(bgArt.id);
      backgroundUrl = URL.createObjectURL(blob);
    }

    return { avatarUrl, backgroundUrl };
  } catch {
    return { avatarUrl: null, backgroundUrl: null };
  }
}

export const useMoodStore = create<MoodState>((set, get) => ({
  activeMoodId: null,
  activeMood: null,
  avatarUrl: null,
  // Background images are in OPFS — resolved async by applySavedMoodSettings()
  backgroundUrl: null,
  moods: [],
  loaded: false,

  loadMoods: async () => {
    const { crux } = getServices();
    const moods = await crux.listByType('mood');
    const savedId = getSetting(SettingsKey.ActiveMoodId) as string | null;

    set({ moods, loaded: true });

    // Restore active mood
    if (savedId) {
      const mood = moods.find((m) => m.id === savedId) || null;
      if (mood) {
        const { avatarUrl, backgroundUrl } = await loadMoodArtifacts(mood.id);
        set({ activeMoodId: savedId, activeMood: mood, avatarUrl, backgroundUrl });
        get().applyMood(mood);
      } else {
        setSetting(SettingsKey.ActiveMoodId, '');
      }
    }
  },

  setActiveMood: async (moodId: string | null) => {
    // Revoke old blob URLs
    const { avatarUrl: oldAvatar, backgroundUrl: oldBg } = get();
    if (oldAvatar) URL.revokeObjectURL(oldAvatar);
    if (oldBg) URL.revokeObjectURL(oldBg);

    if (!moodId) {
      setSetting(SettingsKey.ActiveMoodId, '');
      set({ activeMoodId: null, activeMood: null, avatarUrl: null, backgroundUrl: null });
      get().applyMood(null);
      return;
    }

    try {
      const { crux } = getServices();
      const mood = await crux.findById(moodId);
      const { avatarUrl, backgroundUrl } = await loadMoodArtifacts(moodId);

      setSetting(SettingsKey.ActiveMoodId, moodId);
      set({ activeMoodId: moodId, activeMood: mood, avatarUrl, backgroundUrl });
      get().applyMood(mood);
    } catch {
      setSetting(SettingsKey.ActiveMoodId, '');
      set({ activeMoodId: null, activeMood: null, avatarUrl: null, backgroundUrl: null });
    }
  },

  createMood: async (title: string) => {
    const { crux } = getServices();
    const mood = await crux.create({
      title,
      type: 'mood',
      meta: {
        palette: {},
        persona: {
          name: 'The Keeper',
          description: 'Your creative companion',
          systemPrompt: '',
          greeting: 'What would you like to create today?',
        },
      } as Record<string, unknown>,
    });
    set((s) => ({ moods: [mood, ...s.moods] }));
    return mood;
  },

  updateMood: async (moodId: string, meta: Partial<MoodMeta>) => {
    const { crux } = getServices();
    const updated = await crux.update(moodId, { meta: meta as Record<string, unknown> });
    set((s) => ({
      moods: s.moods.map((m) => (m.id === moodId ? updated : m)),
      activeMood: s.activeMoodId === moodId ? updated : s.activeMood,
    }));

    // Re-apply if this is the active mood
    if (get().activeMoodId === moodId) {
      get().applyMood(updated);
    }

    return updated;
  },

  deleteMood: async (moodId: string) => {
    const { crux } = getServices();
    await crux.delete(moodId);
    set((s) => ({ moods: s.moods.filter((m) => m.id !== moodId) }));

    if (get().activeMoodId === moodId) {
      await get().setActiveMood(null);
    }
  },

  applyMood: (mood: Crux | null) => {
    if (!mood) {
      // Reset to default Garden Dark
      applyMoodPalette({});
      return;
    }

    const meta = mood.meta as MoodMeta | undefined;
    if (!meta) return;

    // Apply palette overrides on top of Garden Dark defaults
    applyMoodPalette(meta.palette || {});

    // Apply background type
    if (meta.backgroundType) {
      document.documentElement.style.setProperty(BG_CSS_VAR, meta.backgroundType);
    }
  },
}));
