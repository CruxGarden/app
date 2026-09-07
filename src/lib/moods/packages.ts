/**
 * Mood Packages — the installable, shareable bundle: theme + background +
 * sound + persona + meta. Stored in settings (JSON) with every binary
 * (cover, background image, the track, persona avatars) in the Blob Store
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
import type { PersonaSettings } from '@/services/persona';
import { getPersona, savePersona } from '@/services/persona';
import { DEFAULT_CUES, getCues, saveCues, type SoundCues } from '@/services/cues';
import * as sound from '@/services/sound';
import { validateTrack, type SoundTrack } from '@/services/sound';
import { getAssets, addAsset, isAssetRef, refFingerprint, kindOf, type MoodAsset } from './assets';

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
  /** Files the Mood brings along (index; bytes ride in the zip under assets/). */
  assets?: MoodAsset[];
  /** The Mood's sound: one looping track, its volume, on/off, and the cues. */
  sound: MoodSound;
  /**
   * Files a bundled Mood ships inside the app (URLs). On apply they are
   * ingested into the Blob Store where there is one, so what the user then
   * saves or exports carries fingerprints like any other Mood. Never set on
   * a captured or imported package.
   */
  bundled?: {
    background?: string;
    avatar?: string;
    track?: { url: string; name: string; type: string };
  };
}

export interface MoodSound {
  track: SoundTrack | null;
  volume: number;
  enabled: boolean;
  cues: SoundCues;
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
  // `sound` is the shape since 2026-09-07; packages saved before carried a
  // `resonance` block (synthesized mixes) — its volume and cues still apply.
  const snd = (p.sound ?? p.resonance ?? {}) as Record<string, unknown>;
  const cues = { ...DEFAULT_CUES };
  for (const k of Object.keys(cues) as (keyof SoundCues)[]) {
    const v = (snd.cues as Record<string, unknown> | undefined)?.[k];
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
    assets: Array.isArray(p.assets)
      ? (p.assets as MoodAsset[]).filter(
          (a) => a && typeof a.fingerprint === 'string' && typeof a.name === 'string',
        )
      : undefined,
    sound: {
      track: validateTrack(snd.track),
      volume: typeof snd.volume === 'number' ? Math.min(1, Math.max(0, snd.volume)) : 0.7,
      enabled: snd.enabled !== false,
      cues,
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
  const cover = input.cover ?? ((getSetting(SettingsKey.MoodCover) as string | null) || undefined);
  const bgImage = (getSetting(SettingsKey.BackgroundImage) as string | null) || undefined;
  const name = input.name.trim() || 'My Mood';
  return {
    format: 'crux-mood',
    version: 1,
    id: input.id ?? slugifyMoodName(name),
    name,
    author: input.author,
    created: new Date().toISOString(),
    cover,
    theme,
    background: { type: bgType, image: bgType === BgType.Image ? bgImage : undefined },
    persona: getPersona(),
    assets: getAssets(),
    sound: {
      track: sound.getTrack(),
      volume: sound.getVolume(),
      enabled: sound.getEnabled(),
      cues: getCues(),
    },
  };
}

/**
 * The persona to save when a package is applied: the package's voice over the
 * user's record, keeping the user's avatars unless the package brings its own.
 * Bundled Moods carry only name/greeting/systemPrompt — a whole-record save
 * used to wipe thumbnailFingerprint / thumbnailFingerprintLight.
 */
export function personaForApply(
  current: PersonaSettings,
  incoming: Partial<PersonaSettings>,
): PersonaSettings {
  const next: Partial<PersonaSettings> = { ...incoming };
  for (const k of [
    'thumbnailFingerprint',
    'thumbnailFingerprintLight',
    'thumbnailDataUrl',
    'thumbnailDataUrlLight',
  ] as const) {
    if (!next[k]) delete next[k];
  }
  return { ...current, ...next };
}

/** Wear a package: theme (as a user preset), background, persona, sound. */
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

  // A bundled Mood's files: into the Blob Store where there is one (the app),
  // straight from their URLs where there is not (the public website).
  const shipped = await ingestBundled(pkg);

  // Background
  const bg = await import('@/services/background');
  if (shipped.background) {
    await bg.setBackgroundImage(shipped.background.fingerprint ?? '', shipped.background.url);
  } else if (pkg.background.type === BgType.Image && pkg.background.image) {
    await bg.setBackgroundImage(pkg.background.image);
  } else {
    await bg.setBackgroundType(
      pkg.background.type === BgType.Image ? BgType.Bloom : pkg.background.type,
    );
  }

  // Persona — voice from the package, avatars kept unless the package brings its own
  if (pkg.persona) {
    const incoming: Partial<PersonaSettings> = { ...pkg.persona };
    if (shipped.avatar) {
      incoming.thumbnailFingerprint = shipped.avatar;
      incoming.thumbnailFingerprintLight = shipped.avatar;
    }
    savePersona(personaForApply(getPersona(), incoming));
  }

  // Assets index (bytes were written on import)
  for (const a of pkg.assets ?? []) addAsset(a);

  // Sound — the package's track, volume, on/off and cues take over.
  const track = shipped.track ?? pkg.sound.track;
  sound.setTrack(track);
  sound.setVolume(pkg.sound.volume);
  sound.setEnabled(pkg.sound.enabled);
  saveCues(pkg.sound.cues);
  const { useAudioStore } = await import('@/stores/audioStore');
  const s = useAudioStore.getState();
  s.init();
  useAudioStore.setState({ volume: pkg.sound.volume, enabled: pkg.sound.enabled });
  s.setVolume(pkg.sound.volume);
  await s.setTrack(track);
}

interface Shipped {
  background?: { fingerprint?: string; url?: string };
  avatar?: string;
  track?: SoundTrack;
}

/** Fetch a shipped file into the Blob Store; null where that is not possible. */
async function ingestUrl(url: string): Promise<{ fingerprint: string; blob: Blob } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const { putBlob } = await import('@/services/blobs');
    const fingerprint = await putBlob(blob);
    return { fingerprint, blob };
  } catch {
    return null;
  }
}

async function ingestBundled(pkg: MoodPackage): Promise<Shipped> {
  const b = pkg.bundled;
  if (!b) return {};
  const { isPublicSite } = await import('@/lib/site');
  const out: Shipped = {};
  if (isPublicSite()) {
    // No garden here: play and show the files from where they are served.
    if (b.background) out.background = { url: b.background };
    if (b.track) out.track = { url: b.track.url, name: b.track.name, type: b.track.type };
    return out;
  }
  if (b.background) {
    const got = await ingestUrl(b.background);
    out.background = got ? { fingerprint: got.fingerprint } : { url: b.background };
  }
  if (b.avatar) out.avatar = (await ingestUrl(b.avatar))?.fingerprint;
  if (b.track) {
    const got = await ingestUrl(b.track.url);
    if (got) {
      addAsset({
        fingerprint: got.fingerprint,
        name: b.track.name,
        type: b.track.type,
        size: got.blob.size,
        kind: kindOf(b.track.type, b.track.name),
      });
      out.track = { fingerprint: got.fingerprint, name: b.track.name, type: b.track.type };
    } else out.track = { url: b.track.url, name: b.track.name, type: b.track.type };
  }
  return out;
}

/** Every Blob Store fingerprint a package references. */
export function packageAssets(pkg: MoodPackage): string[] {
  const fps = new Set<string>();
  if (pkg.cover) fps.add(pkg.cover);
  for (const a of pkg.assets ?? []) fps.add(a.fingerprint);
  for (const v of Object.values(pkg.theme.overrides)) if (isAssetRef(v)) fps.add(refFingerprint(v));
  if (pkg.background.image) fps.add(pkg.background.image);
  if (pkg.persona?.thumbnailFingerprint) fps.add(pkg.persona.thumbnailFingerprint);
  if (pkg.persona?.thumbnailFingerprintLight) fps.add(pkg.persona.thumbnailFingerprintLight);
  if (pkg.sound.track?.fingerprint) fps.add(pkg.sound.track.fingerprint);
  return [...fps];
}

/** Zip: package.json + assets/<fingerprint> for every referenced blob that exists. */
export async function exportMoodPackage(
  pkg: MoodPackage,
  readBlob: (fp: string) => Promise<Uint8Array>,
  opts: { includeAudio?: boolean } = {},
): Promise<Blob> {
  const zip = new JSZip();
  const portable: Partial<MoodPackage> = { ...pkg };
  delete portable.bundled;
  zip.file('package.json', JSON.stringify(portable, null, 2));
  const audioFps = new Set<string>();
  if (pkg.sound.track?.fingerprint) audioFps.add(pkg.sound.track.fingerprint);
  for (const a of pkg.assets ?? []) if (a.kind === 'audio') audioFps.add(a.fingerprint);
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
