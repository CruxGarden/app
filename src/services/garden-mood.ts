import type { MoodPackage } from '@/lib/moods/packages';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { captureGardenId, useGardenContext } from '@/stores/gardenContext';
import { getSqliteClient } from './sqlite/client';
import { builtInMoodCrux, readMoodCrux } from './mood-library';

/**
 * A Garden wears a Mood: its own choice, its parent's by inheritance, or the
 * Default Mood. The API owns the choice (a graft/mood association plus
 * inherit/own/none policy); this module turns the active Garden's resolved
 * choice into the one painted look, and nothing else.
 */
export type GardenMoodMode = 'inherit' | 'own' | 'none';
export const DEFAULT_MOOD_ID = 'plasma';

export interface GardenMood {
  gardenId: string;
  /** This Garden's own policy. */
  mode: GardenMoodMode;
  /** Where the look comes from: this Garden, an ancestor, or the Default Mood. */
  source: { mode: 'own' | 'none' | 'default'; gardenId: string | null; title: string | null };
  /** The worn card: a built-in Mood ID or a saved Mood's Crux ID. */
  wornId: string;
  name: string;
  isRoot: boolean;
}

interface Target {
  pkg: MoodPackage;
  wornId: string;
  key: string;
}

function bridge() {
  const api = getSqliteClient().gardenMood;
  if (!api) throw new Error('Garden Moods need the desktop app.');
  return api;
}

const builtIn = async (id: string) => (await import('@/lib/moods/bundled-moods')).bundledMood(id);

async function target(moodId: string | null): Promise<Target> {
  if (moodId) {
    const { pkg, portableId, revision } = await readMoodCrux(moodId);
    const shipped = await builtIn(portableId);
    // A built-in choice wears the Mood as it ships now.
    if (shipped) return { pkg: shipped, wornId: shipped.id, key: shipped.id };
    return { pkg, wornId: moodId, key: `${moodId}:${revision}` };
  }
  const shipped = (await builtIn(DEFAULT_MOOD_ID))!;
  return { pkg: shipped, wornId: shipped.id, key: shipped.id };
}

async function resolved(gardenId: string) {
  const api = bridge();
  const [own, found] = await Promise.all([api.read(gardenId), api.resolve(gardenId)]);
  const moodId = found.mode === 'own' ? (found.moodId as string) : null;
  return { own, found, moodId, target: await target(moodId) };
}

export async function readGardenMood(gardenId = captureGardenId()): Promise<GardenMood | null> {
  if (!gardenId || !getSqliteClient().gardenMood) return null;
  const { own, found, target: t } = await resolved(gardenId);
  return {
    gardenId,
    mode: own.selection.mode,
    source: {
      mode: found.mode,
      gardenId: (found.sourceGardenId as string | null) ?? null,
      title: (found.sourceTitle as string | null) ?? null,
    },
    wornId: t.wornId,
    name: t.pkg.name,
    isRoot: useGardenContext.getState().root?.id === gardenId,
  };
}

let writes: Promise<unknown> = Promise.resolve();
/** One choice at a time, so a built-in Mood gets exactly one backing Crux. */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = writes.then(work, work);
  writes = next.catch(() => {});
  return next;
}

async function select(gardenId: string, mode: GardenMoodMode, moodId: string | null) {
  const api = bridge();
  const expected = (await api.read(gardenId)).selection;
  await api.select({ gardenId, mode, moodId, expected });
}

/** Choose a Mood for a Garden (the active one by default) and paint it if active. */
export function wearInGarden(pkg: MoodPackage, gardenId = captureGardenId()): Promise<void> {
  if (!gardenId) return Promise.reject(new Error('Open a Garden to choose its Mood.'));
  return serial(async () => {
    const moodId = (await builtIn(pkg.id)) ? await builtInMoodCrux(pkg) : pkg.id;
    await select(gardenId, 'own', moodId);
  }).then(() => projectActiveGarden());
}

/** Return to the parent's Mood, or wear the Default Mood and stop inheriting. */
export function setGardenMoodMode(
  mode: Exclude<GardenMoodMode, 'own'>,
  gardenId = captureGardenId(),
): Promise<void> {
  if (!gardenId) return Promise.reject(new Error('Open a Garden to choose its Mood.'));
  return serial(() => select(gardenId, mode, null)).then(() => projectActiveGarden());
}

const listeners = new Set<() => void>();
export function onGardenMoodChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let painting: Promise<void> = Promise.resolve();
/** Paint the active Garden's Mood. Serialized; a later Garden always paints last. */
export function projectActiveGarden(): Promise<void> {
  painting = painting.then(project).catch((error) => console.error('[garden mood]', error));
  return painting;
}

async function project(): Promise<void> {
  const gardenId = captureGardenId();
  if (!gardenId || !getSqliteClient().gardenMood) return;
  await adoptWornMood();
  const { target: t } = await resolved(gardenId);
  // The Garden changed while this was reading; its own projection is queued.
  if (captureGardenId() !== gardenId) return;
  const last = getSetting(SettingsKey.MoodProjection);
  if (last !== t.key) {
    // Already wearing it (a fresh garden's Default Mood): record, do not repaint.
    if (last || getSetting(SettingsKey.WornMoodId) !== t.wornId) {
      const { applyMood } = await import('@/lib/moods/packages');
      await applyMood(t.pkg);
    }
    setSetting(SettingsKey.MoodProjection, t.key);
  }
  listeners.forEach((fn) => fn());
}

/**
 * Once per device: the look worn before Gardens owned their Mood becomes the
 * root Garden's choice, so nobody's appearance changes under them.
 */
async function adoptWornMood(): Promise<void> {
  if (getSetting(SettingsKey.MoodProjection)) return;
  const root = useGardenContext.getState().root?.id;
  const worn = getSetting(SettingsKey.WornMoodId);
  if (!root || !worn || worn === DEFAULT_MOOD_ID) return;
  const found = await bridge().resolve(root);
  if (found.mode !== 'default') return;
  const shipped = await builtIn(worn);
  const saved = shipped ? null : await readMoodCrux(worn).catch(() => null);
  if (!shipped && !saved) return;
  const moodId = await serial(async () => {
    const id = shipped ? await builtInMoodCrux(shipped) : worn;
    await select(root, 'own', id);
    return id;
  });
  setSetting(SettingsKey.MoodProjection, (await target(moodId)).key);
}

let stop: (() => void) | undefined;
/** Follow the active Garden and graph changes to its choice. Idempotent. */
export function startGardenMoodProjection(): void {
  stop?.();
  const offGarden = useGardenContext.subscribe((state, previous) => {
    if (state.garden?.id !== previous.garden?.id) void projectActiveGarden();
  });
  const offGraph = getSqliteClient().onChange?.((change) => {
    const keys = change.metaKeys ?? [];
    if (
      change.entity === 'garden-membership' ||
      change.entity === 'crux-lifecycle' ||
      (change.entity === 'crux' &&
        (keys.includes('moodSelection') || change.fields?.includes('fileContent')))
    )
      void projectActiveGarden();
  });
  stop = () => {
    offGarden();
    offGraph?.();
  };
  void projectActiveGarden();
}

/** Every "wear this Mood" control: the active Garden's choice where Gardens own Moods. */
export async function chooseMood(pkg: MoodPackage): Promise<void> {
  if (getSqliteClient().gardenMood && captureGardenId()) return wearInGarden(pkg);
  const { applyMood } = await import('@/lib/moods/packages');
  await applyMood(pkg);
}
