import { firstCruxLayout, startingActivity, type StartKind } from './setup-workspace';
import { SettingsKey } from '@/lib/constants';
import { Capability, can } from '@/lib/platform';
import { getSetting, setSetting } from '@/services/settings';
import { useAppStore } from '@/stores/appStore';
import { useUIStore } from '@/stores/uiStore';
import { captureGardenId, cruxPath, inGarden, useGardenContext } from '@/stores/gardenContext';
import type { MoodPackage } from '@/lib/moods/packages';
import type { CruxKind } from '@/api/types';
import type { CueKind } from '@/services/cues';
import type { LookSnapshot } from '@/services/garden-mood';
import { BgType, ThemeMode } from '@/lib/types';
import {
  HOME_PAGE_TEMPLATE,
  resolveStartingPoint,
  type CatalogEntry,
  type SetupMode,
  type SetupNeed,
} from './setup-plan';
import type { SetupDeps } from './setup-finish';
import { useSetupWizard, type SetupStart } from './setup-store';

/**
 * The Setup wizard's reach into the app: the real services behind
 * setup-finish's dependencies, the suggested first Crux and how it is made,
 * and the live Mood preview. Kept out of the components so each screen stays
 * about presentation.
 */

const DEFAULT_MOOD_ID = 'plasma';

/** What the wizard starts from: today's choices, so running it again edits rather than replaces. */
export function setupStartFor(mode: SetupMode): SetupStart {
  const author = useAppStore.getState().author;
  const { root, garden: selected } = useGardenContext.getState();
  const garden = mode === 'first' ? (root ?? selected) : (selected ?? root);
  const need = getSetting(SettingsKey.SetupNeed) as SetupNeed | null;
  return {
    mode,
    advancedMode: getSetting(SettingsKey.AdvancedMode) === 'true',
    need: mode === 'again' ? need : null,
    gardenName: garden?.title ?? '',
    username:
      mode === 'again' && author?.username && !author.username.startsWith('wanderer-')
        ? author.username
        : '',
    aiAtStart: getSetting(SettingsKey.AiEnabled),
    moodAtStart: getSetting(SettingsKey.WornMoodId),
  };
}

async function moodPackage(id: string): Promise<MoodPackage | undefined> {
  const [{ bundledMood }, { getInstalledMoods }] = await Promise.all([
    import('@/lib/moods/bundled-moods'),
    import('@/lib/moods/packages'),
  ]);
  return bundledMood(id) ?? getInstalledMoods().find((m) => m.id === id);
}

/** The real services, exactly as the Gateway's setup used them. */
export function setupDeps(mode: SetupMode): SetupDeps {
  return {
    ensureAuthor: () => useAppStore.getState().ensureAuthor(),
    currentUsername: () => useAppStore.getState().author?.username,
    updateUsername: (username) => useAppStore.getState().updateAuthor({ username }),
    uploadPhoto: (file) => useAppStore.getState().uploadAvatar(file),
    garden: () => {
      const { root, garden } = useGardenContext.getState();
      return (mode === 'first' ? (root ?? garden) : (garden ?? root)) ?? null;
    },
    renameGarden: async (id, title) =>
      (await import('@/services/garden-navigation')).renameGarden(id, title),
    aiSetting: () => getSetting(SettingsKey.AiEnabled),
    setAiEnabled: (on) => {
      setSetting(SettingsKey.AiEnabled, on ? 'true' : 'false');
      useUIStore.getState().setAiEnabled(on);
    },
    wearMood: async (id) => {
      const pkg = await moodPackage(id);
      if (!pkg) return;
      if (mode === 'first') {
        // A new garden wears its Mood as it always did on planting (ADR 0043).
        const { applyMood } = await import('@/lib/moods/packages');
        await applyMood(pkg);
      } else {
        const { chooseMood } = await import('@/services/garden-mood');
        await chooseMood(pkg);
      }
    },
    defaultMoodId: DEFAULT_MOOD_ID,
    rememberNeed: (need) => setSetting(SettingsKey.SetupNeed, need),
    setAdvancedMode: (on) => setSetting(SettingsKey.AdvancedMode, String(on)),
  };
}

/** A Mood's display name, for the summary. */
export async function moodName(id: string | null): Promise<string> {
  return (await moodPackage(id ?? DEFAULT_MOOD_ID))?.name ?? 'Your current Mood';
}

/**
 * Show a Mood behind the wizard without making it the Garden's choice yet
 * (as the Gateway wears its Mood before a garden exists: no sound, no schedules).
 */
export async function previewMood(id: string, opts: { cue?: boolean } = {}): Promise<void> {
  const pkg = await moodPackage(id);
  if (!pkg) return;
  const [{ applyMood }, { captureLook }] = await Promise.all([
    import('@/lib/moods/packages'),
    import('@/services/garden-mood'),
  ]);
  // The look as it was before the first preview, to put back exactly.
  lookAtStart ??= captureLook();
  await applyMood(pkg, { sound: false });
  if (opts.cue) await playSetupCue(pkg.sound.cues.snapshot ?? pkg.sound.cues.published);
}

/**
 * A short sound for a moment in setup — only when the person has sound on
 * (and never under CRUX_SILENT, which the audio store already honours).
 */
export async function playSetupCue(kind?: CueKind | null): Promise<void> {
  if (!kind) return;
  const { useAudioStore } = await import('@/stores/audioStore');
  const audio = useAudioStore.getState();
  if (!audio.optIn || !audio.enabled) return;
  await audio.cue(kind).catch(() => {});
}

/** The garden is planted: the worn Mood's own "something grew" cue. */
export async function playPlantedCue(): Promise<void> {
  const { getCues } = await import('@/services/cues');
  const cues = getCues();
  await playSetupCue(cues.snapshot ?? cues.published);
}

let lookAtStart: LookSnapshot | null = null;

/** Redraw the look from settings: theme mode, palette and background. */
async function repaintFromSettings(): Promise<void> {
  const [{ useThemeStore }, { applySavedMoodSettings }, { setBackgroundType }] = await Promise.all([
    import('@/stores/themeStore'),
    import('@/components/mood/mood-helpers'),
    import('@/services/background'),
  ]);
  const mode = getSetting(SettingsKey.Theme) as ThemeMode | null;
  if (mode && useThemeStore.getState().mode !== mode) useThemeStore.getState().setMode(mode);
  applySavedMoodSettings();
  const background = getSetting(SettingsKey.BackgroundType) as BgType | null;
  if (background && background !== BgType.Image) await setBackgroundType(background);
}

/**
 * Put back the look from before the first preview — palette, background,
 * Persona and whether the Mood pane counted it as an edit — exactly.
 */
export async function restoreMood(): Promise<void> {
  const snapshot = lookAtStart;
  lookAtStart = null;
  if (!snapshot) return;
  const { restoreLook } = await import('@/services/garden-mood');
  await restoreLook(snapshot, repaintFromSettings);
}

/** The preview became the choice (or was put back by applying): nothing to restore. */
export function forgetMoodPreview(): void {
  lookAtStart = null;
}

/**
 * Leave without applying anything: the previewed look goes back exactly. A
 * first run keeps its other answers for when the person returns; running
 * again forgets them.
 */
export async function abandonSetup(): Promise<void> {
  const state = useSetupWizard.getState();
  if (state.mode === 'again') state.reset();
  else state.set({ moodId: null });
  await restoreMood().catch(() => {});
}

/** The Add Crux catalog's starting point for a need, on this build. */
export async function suggestedStartingPoint(
  need: SetupNeed | null,
): Promise<CatalogEntry | undefined> {
  const [{ templateCatalog }, { isToolAvailable }] = await Promise.all([
    import('@/components/garden/NewCruxModal'),
    import('@/services/crux-tools/registry'),
  ]);
  return resolveStartingPoint(need, templateCatalog(), {
    canBuild: can(Capability.Build),
    isAvailable: isToolAvailable,
  });
}

/** Panels a new Crux opens with, as Add Crux sets them. */
function collaborationWidth(templateId: string): number | undefined {
  if (templateId === 'notes') return 27;
  if (
    ['moqira', 'onebigsky', 'cardinal-drone'].includes(templateId) ||
    templateId.startsWith('tool-')
  )
    return 22;
  return undefined;
}

/**
 * Make the first Crux and return where it opens. The home page keeps the
 * first-home-page path (its own walkthrough); everything else is made the way
 * Add Crux makes it.
 */
export async function createFirstCrux(
  entry: CatalogEntry,
  title: string,
  options?: {
    mode?: SetupMode;
    need: SetupNeed | null;
    advancedMode: boolean;
    startKind: StartKind;
  },
): Promise<string> {
  const activity = startingActivity(entry.id, options?.need ?? null);
  const layout = options
    ? firstCruxLayout(entry.id, {
        ...options,
        aiEnabled: getSetting(SettingsKey.AiEnabled) === 'true',
        width: window.innerWidth,
        height: window.innerHeight,
      })
    : undefined;
  const gardenId = captureGardenId();
  const name = title.trim();
  if (entry.id === HOME_PAGE_TEMPLATE && can(Capability.Build) && options?.mode !== 'again') {
    const { seedWelcomeCrux } = await import('@/services/welcome-crux');
    const id = await seedWelcomeCrux(gardenId, name || undefined);
    if (options) {
      const { getServices } = await import('@/services');
      const crux = await getServices().crux.findById(id);
      await getServices().crux.update(id, {
        meta: { ...crux.meta, setupStartKind: options.startKind },
      });
    }
    useUIStore.getState().seedCruxLayout(id, 22, layout);
    return cruxPath({ id, kind: 'webapp' });
  }
  const [{ createCruxStore }, { applyTemplateToCrux }] = await Promise.all([
    import('@/stores/cruxStore'),
    import('@/services/crux-create'),
  ]);
  const store = createCruxStore();
  const crux = await store.getState().createCrux(name || entry.label, gardenId);
  const made =
    entry.id !== 'blank'
      ? (await applyTemplateToCrux(crux, entry.id, entry.kind as CruxKind)).crux
      : crux;
  if (options) {
    const { getServices } = await import('@/services');
    await getServices().crux.update(crux.id, {
      meta: {
        ...made.meta,
        setupStartKind: options.startKind,
        ...(options.startKind === 'guided' ? { setupGuide: { need: activity } } : {}),
      },
    });
  }
  useUIStore.getState().seedCruxLayout(crux.id, collaborationWidth(entry.id), layout);
  return inGarden(`/c/${crux.id}`, gardenId);
}

export async function setupStartingPoints(need: SetupNeed | null): Promise<CatalogEntry[]> {
  const [{ templateCatalog }, { isToolAvailable }, { needChoice }] = await Promise.all([
    import('@/components/garden/NewCruxModal'),
    import('@/services/crux-tools/registry'),
    import('./setup-plan'),
  ]);
  const preferred = needChoice(need ?? 'exploring')?.templates ?? [];
  return templateCatalog()
    .filter(
      (entry) =>
        entry.id !== 'garden' &&
        isToolAvailable(entry.id) &&
        (!entry.desktopOnly || can(Capability.Build)),
    )
    .sort((a, b) => {
      const rank = (id: string) =>
        preferred.includes(id) ? preferred.indexOf(id) : preferred.length;
      return rank(a.id) - rank(b.id);
    });
}
