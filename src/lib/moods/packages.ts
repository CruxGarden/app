/**
 * Mood Packages — the installable, shareable bundle: theme + background +
 * persona + resonance + meta. Stored in settings (JSON) with every binary
 * (cover, background image, audio files, persona avatars) in the Blob Store
 * by fingerprint; exported as a `.cruxmood` zip that carries those assets.
 */
import JSZip from 'jszip';
import { GARDEN_DARK } from './garden-dark';
import type { MoodThemeFile } from './user-presets';
import { saveUserPreset } from './user-presets';
import {
  activePreset,
  applyActiveMood,
  getThemeOverrides,
  resolvedSection,
  setThemeOverrides,
  type MoodSection,
} from './active';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { BgType } from '@/lib/types';
import type { Mix } from '@/audio/schema';
import { validateMix } from '@/audio/schema';
import { validatePlaylist, type Playlist } from '@/audio/playlist';
import type { PersonaSettings } from '@/services/persona';
import { getPersona, savePersona } from '@/services/persona';
import { DEFAULT_CUES, getCues, saveCues, type SoundCues } from '@/services/cues';
import * as resonance from '@/services/resonance';

export interface MoodPackage {
  format: 'crux-mood';
  version: 1;
  id: string;
  name: string;
  author?: string;
  created: string;
  /** Blob fingerprint of a cover image */
  cover?: string;
  /** The crux this Mood was published as (crux.garden), if any */
  publishedCruxId?: string;
  publishedAt?: string;
  theme: MoodThemeFile;
  background: { type: BgType; image?: string };
  persona?: PersonaSettings;
  resonance: {
    mixes: Mix[];
    playlist: Playlist;
    cues: SoundCues;
    activeMixId: string;
    volume: number;
  };
}

const listeners = new Set<() => void>();
export function onMoodPackagesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function slugifyMoodName(name: string): string {
  return (
    'mood-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  );
}

function cleanTheme(raw: unknown, fallbackSection: MoodSection): MoodThemeFile {
  const t = (raw ?? {}) as Record<string, unknown>;
  const overrides: Record<string, string> = {};
  for (const [k, v] of Object.entries((t.overrides as Record<string, unknown>) ?? {})) {
    if (k in GARDEN_DARK && typeof v === 'string' && v.trim()) overrides[k] = v;
  }
  return {
    format: 'crux-mood-theme',
    version: 1,
    name: typeof t.name === 'string' ? t.name : 'Theme',
    section: t.section === 'Light' ? 'Light' : t.section === 'Dark' ? 'Dark' : fallbackSection,
    author: typeof t.author === 'string' ? t.author : undefined,
    overrides,
  };
}

/** Accepts anything; returns a well-formed package or null. */
export function validateMoodPackage(raw: unknown): MoodPackage | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.format !== 'crux-mood') return null;
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Untitled Mood';
  const bg = (p.background ?? {}) as Record<string, unknown>;
  const type = (Object.values(BgType) as string[]).includes(bg.type as string)
    ? (bg.type as BgType)
    : BgType.Bloom;
  const res = (p.resonance ?? {}) as Record<string, unknown>;
  const mixes = Array.isArray(res.mixes)
    ? (res.mixes.map(validateMix).filter(Boolean) as Mix[])
    : [];
  const mixIds = mixes.map((m) => m.id);
  const cues = { ...DEFAULT_CUES };
  for (const k of Object.keys(cues) as (keyof SoundCues)[]) {
    const v = (res.cues as Record<string, unknown> | undefined)?.[k];
    if (v === null) cues[k] = null;
    else if (v === 'tick' || v === 'chime' || v === 'bloom' || v === 'thud') cues[k] = v;
  }
  const persona =
    p.persona && typeof p.persona === 'object' ? (p.persona as PersonaSettings) : undefined;
  return {
    format: 'crux-mood',
    version: 1,
    id: typeof p.id === 'string' && p.id ? p.id : slugifyMoodName(name),
    name,
    author: typeof p.author === 'string' ? p.author : undefined,
    created: typeof p.created === 'string' ? p.created : new Date().toISOString(),
    cover: typeof p.cover === 'string' && p.cover ? p.cover : undefined,
    publishedCruxId:
      typeof p.publishedCruxId === 'string' && p.publishedCruxId ? p.publishedCruxId : undefined,
    publishedAt: typeof p.publishedAt === 'string' && p.publishedAt ? p.publishedAt : undefined,
    theme: cleanTheme(p.theme, 'Dark'),
    background: { type, image: typeof bg.image === 'string' && bg.image ? bg.image : undefined },
    persona: persona && typeof persona.name === 'string' ? persona : undefined,
    resonance: {
      mixes,
      playlist: validatePlaylist(res.playlist, mixIds),
      cues,
      activeMixId:
        typeof res.activeMixId === 'string' && mixIds.includes(res.activeMixId)
          ? res.activeMixId
          : (mixIds[0] ?? ''),
      volume: typeof res.volume === 'number' ? Math.min(1, Math.max(0, res.volume)) : 0.7,
    },
  };
}

export function getInstalledMoods(): MoodPackage[] {
  const raw = getSetting(SettingsKey.MoodPackages) as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed.map(validateMoodPackage).filter(Boolean) as MoodPackage[])
      : [];
  } catch {
    return [];
  }
}

function write(list: MoodPackage[]) {
  setSetting(SettingsKey.MoodPackages, list.length ? JSON.stringify(list) : '');
  listeners.forEach((fn) => fn());
}

export function installMood(pkg: MoodPackage): MoodPackage {
  const rest = getInstalledMoods().filter((m) => m.id !== pkg.id);
  write([...rest, pkg]);
  return pkg;
}

export function deleteMood(id: string): void {
  write(getInstalledMoods().filter((m) => m.id !== id));
}

/** Everything the app is wearing right now, as one package. */
export function captureCurrentMood(input: {
  name: string;
  author?: string;
  id?: string;
  cover?: string;
}): MoodPackage {
  const section = resolvedSection();
  const preset = activePreset(section);
  const theme: MoodThemeFile = {
    format: 'crux-mood-theme',
    version: 1,
    name: preset?.name ?? 'Garden Dark',
    section,
    author: input.author,
    overrides: { ...(preset?.overrides ?? {}), ...getThemeOverrides(section) },
  };
  const bgType = (getSetting(SettingsKey.BackgroundType) as BgType | null) ?? BgType.Bloom;
  const bgImage = (getSetting(SettingsKey.BackgroundImage) as string | null) || undefined;
  const mixes = resonance.getMixes();
  const name = input.name.trim() || 'My Mood';
  return {
    format: 'crux-mood',
    version: 1,
    id: input.id ?? slugifyMoodName(name),
    name,
    author: input.author,
    created: new Date().toISOString(),
    cover: input.cover,
    theme,
    background: { type: bgType, image: bgType === BgType.Image ? bgImage : undefined },
    persona: getPersona(),
    resonance: {
      mixes,
      playlist: resonance.getPlaylist(mixes.map((m) => m.id)),
      cues: getCues(),
      activeMixId: resonance.getActiveMixId(),
      volume: resonance.getVolume(),
    },
  };
}

/** Wear a package: theme (as a user preset), background, persona, resonance. */
export async function applyMood(pkg: MoodPackage): Promise<void> {
  // Theme → a user preset with the package's id, made active for its mode
  const preset = saveUserPreset({
    id: `user-${pkg.id}`,
    name: pkg.name,
    section: pkg.theme.section,
    overrides: pkg.theme.overrides,
    author: pkg.author,
  });
  setSetting(
    pkg.theme.section === 'Light' ? SettingsKey.MoodPresetLight : SettingsKey.MoodPresetDark,
    preset.id,
  );
  setThemeOverrides(pkg.theme.section, {});
  const { useThemeStore } = await import('@/stores/themeStore');
  const { ThemeMode } = await import('@/lib/types');
  if (resolvedSection() !== pkg.theme.section) {
    useThemeStore
      .getState()
      .setMode(pkg.theme.section === 'Light' ? ThemeMode.Light : ThemeMode.Dark);
  } else {
    applyActiveMood(pkg.theme.section);
  }

  // Background
  const bg = await import('@/services/background');
  if (pkg.background.type === BgType.Image && pkg.background.image) {
    await bg.setBackgroundImage(pkg.background.image);
  } else {
    await bg.setBackgroundType(
      pkg.background.type === BgType.Image ? BgType.Bloom : pkg.background.type,
    );
  }

  // Persona
  if (pkg.persona) savePersona(pkg.persona);

  // Resonance
  if (pkg.resonance.mixes.length) {
    resonance.saveMixes(pkg.resonance.mixes);
    resonance.setActiveMixId(pkg.resonance.activeMixId);
    resonance.savePlaylist(pkg.resonance.playlist);
    resonance.setVolume(pkg.resonance.volume);
    saveCues(pkg.resonance.cues);
    const { useAudioStore } = await import('@/stores/audioStore');
    const s = useAudioStore.getState();
    useAudioStore.setState({
      mixes: pkg.resonance.mixes,
      playlist: pkg.resonance.playlist,
      volume: pkg.resonance.volume,
    });
    await s.selectMix(pkg.resonance.activeMixId);
    s.setVolume(pkg.resonance.volume);
  }
}

/** Every Blob Store fingerprint a package references. */
export function packageAssets(pkg: MoodPackage): string[] {
  const fps = new Set<string>();
  if (pkg.cover) fps.add(pkg.cover);
  if (pkg.background.image) fps.add(pkg.background.image);
  if (pkg.persona?.thumbnailFingerprint) fps.add(pkg.persona.thumbnailFingerprint);
  if (pkg.persona?.thumbnailFingerprintLight) fps.add(pkg.persona.thumbnailFingerprintLight);
  for (const m of pkg.resonance.mixes)
    for (const l of m.layers) {
      const fp = l.params.fingerprint;
      if (typeof fp === 'string' && fp) fps.add(fp);
    }
  return [...fps];
}

/** Zip: package.json + assets/<fingerprint> for every referenced blob that exists. */
export async function exportMoodPackage(
  pkg: MoodPackage,
  readBlob: (fp: string) => Promise<Uint8Array>,
  opts: { includeAudio?: boolean } = {},
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('package.json', JSON.stringify(pkg, null, 2));
  const audioFps = new Set<string>();
  for (const m of pkg.resonance.mixes)
    for (const l of m.layers) {
      const fp = l.params.fingerprint;
      if (typeof fp === 'string' && fp) audioFps.add(fp);
    }
  for (const fp of packageAssets(pkg)) {
    if (opts.includeAudio === false && audioFps.has(fp)) continue;
    try {
      const bytes = await readBlob(fp);
      if (bytes?.length) zip.file(`assets/${fp}`, bytes, { binary: true });
    } catch {
      /* missing asset: the package still describes the look */
    }
  }
  return zip.generateAsync({ type: 'blob' });
}

/** Read a .cruxmood: validates, writes assets into the Blob Store, returns the package (not yet installed). */
export async function importMoodPackage(
  data: ArrayBuffer | Blob,
  putBlob: (bytes: Uint8Array) => Promise<string>,
): Promise<MoodPackage | null> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const zip = await JSZip.loadAsync(buf);
  const manifest = zip.file('package.json');
  if (!manifest) return null;
  const pkg = validateMoodPackage(JSON.parse(await manifest.async('string')));
  if (!pkg) return null;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith('assets/')) continue;
    const bytes = await entry.async('uint8array');
    await putBlob(bytes); // content-addressed: the fingerprint is the filename
  }
  return pkg;
}
