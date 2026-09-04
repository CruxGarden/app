import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import { GARDEN_DARK } from '@/lib/moods';
import { MOOD_PRESETS, type MoodPresetDef } from '@/lib/moods/presets';
import {
  getUserPresets,
  deleteUserPreset,
  onUserPresetsChange,
  type UserPreset,
} from '@/lib/moods/user-presets';
import { applyActiveMood } from '@/lib/moods/active';
import ThemeTokensTab from './ThemeTokensTab';
import ResonanceTab from './ResonanceTab';
import MoodBrowser from './MoodBrowser';
import AssetsTab from './AssetsTab';
import { useMoodStore } from '@/stores/moodStore';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { BgType, ThemeMode } from '@/lib/types';
import {
  getPersona,
  savePersona,
  DEFAULT_PERSONA,
  getResolvedMode,
  type PersonaSettings,
} from './mood-helpers';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { Button } from '@/components/ui';

// ── Preset thumbnail ─────────────────────────────────

function PresetThumb({ preset, active }: { preset: MoodPresetDef; active: boolean }) {
  const p = (key: string) =>
    preset.overrides[key] || (GARDEN_DARK as Record<string, string>)[key] || '#888';

  return (
    <div
      className={cn(
        'w-full rounded-[6px] p-[2px] transition-all',
        active ? 'bg-accent' : 'bg-transparent hover:bg-text-muted/30',
      )}
    >
      <div className="rounded-[4px] overflow-hidden">
        <div className="flex flex-col" style={{ backgroundColor: p('bg'), height: 60 }}>
          {/* Toolbar */}
          <div
            className="h-2.5 flex items-center px-1 gap-0.5"
            style={{ backgroundColor: p('surface'), borderBottom: `1px solid ${p('border')}` }}
          >
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: p('accent') }} />
            <div className="flex-1" />
            <div className="flex gap-px">
              {(['paneCollaboration', 'paneArtifacts', 'paneWorkshop', 'paneDetails'] as const).map(
                (k) => (
                  <div
                    key={k}
                    className="w-1.5 h-1.5 rounded-[1px]"
                    style={{ backgroundColor: p(k) }}
                  />
                ),
              )}
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 flex p-1 gap-1">
            <div className="flex-1 flex flex-col justify-end gap-0.5">
              <div
                className="self-end w-3/4 h-1.5 rounded-[1px]"
                style={{ backgroundColor: `color-mix(in srgb, ${p('accent')} 15%, transparent)` }}
              />
              <div
                className="self-start w-2/3 h-1.5 rounded-[1px]"
                style={{ backgroundColor: p('surface') }}
              />
            </div>
            <div
              className="w-4"
              style={{ backgroundColor: p('panel'), borderLeft: `1px solid ${p('border')}` }}
            >
              <div
                className="mt-0.5 mx-0.5 h-1 rounded-[1px]"
                style={{ backgroundColor: p('accent'), opacity: 0.5 }}
              />
              <div
                className="mt-0.5 mx-0.5 h-1 rounded-[1px]"
                style={{ backgroundColor: p('surface') }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Persona Tab ──────────────────────────────────────

import keeperAvatarDark from '@/images/keeper-avatar-pixel-dark.jpg';
import keeperAvatarLight from '@/images/keeper-avatar-pixel-light.jpg';

function PersonaTab() {
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());
  const fileRef = useRef<HTMLInputElement>(null);
  const fileLightRef = useRef<HTMLInputElement>(null);
  const darkThumbUrl = useBlobUrl(persona.thumbnailFingerprint);
  const lightThumbUrl = useBlobUrl(persona.thumbnailFingerprintLight);

  const update = (patch: Partial<PersonaSettings>) => {
    const next = { ...persona, ...patch };
    setPersona(next);
    savePersona(next);
  };

  const handleThumbnailUpload =
    (field: 'thumbnailFingerprint' | 'thumbnailFingerprintLight') =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) return;

      // Resize to 128x128 square
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d')!;
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;
            ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
            resolve(canvas.toDataURL('image/webp', 0.8));
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      });

      // Write to OPFS blob store
      const res = await fetch(dataUrl);
      const buffer = new Uint8Array(await res.arrayBuffer());
      const { putBlob } = await import('@/services/blobs');
      const fp = await putBlob(buffer);

      // Clear legacy data URL field if present
      const legacyField =
        field === 'thumbnailFingerprint' ? 'thumbnailDataUrl' : 'thumbnailDataUrlLight';
      update({ [field]: fp, [legacyField]: null });
      e.target.value = '';
    };

  const handleReset = () => {
    const fresh = { ...DEFAULT_PERSONA };
    setPersona(fresh);
    savePersona(fresh);
  };

  const isCustomized =
    persona.name !== DEFAULT_PERSONA.name ||
    persona.greeting !== DEFAULT_PERSONA.greeting ||
    persona.systemPrompt !== DEFAULT_PERSONA.systemPrompt ||
    !!persona.thumbnailFingerprint ||
    !!persona.thumbnailFingerprintLight;

  const inputClass = cn(
    'w-full bg-bg border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5',
    'text-xs text-text placeholder:text-text-muted/50',
    'focus:outline-none focus:border-input-border-active font-mono',
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Thumbnails */}
      <div className="shrink-0">
        <div className="text-3xs font-mono uppercase tracking-wider text-text-muted mb-2">
          Avatar
        </div>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 shrink-0 rounded-[var(--radius)] border border-border overflow-hidden bg-surface hover:border-accent cursor-pointer"
            >
              <img
                src={darkThumbUrl || keeperAvatarDark}
                alt=""
                className="w-full h-full object-cover [image-rendering:pixelated]"
              />
            </button>
            <span className="text-3xs font-mono text-text-muted">Dark</span>
            {persona.thumbnailFingerprint && (
              <button
                onClick={() => update({ thumbnailFingerprint: null, thumbnailDataUrl: null })}
                className="text-3xs text-error hover:text-text cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => fileLightRef.current?.click()}
              className="w-16 h-16 shrink-0 rounded-[var(--radius)] border border-border overflow-hidden bg-surface hover:border-accent cursor-pointer"
            >
              <img
                src={lightThumbUrl || keeperAvatarLight}
                alt=""
                className="w-full h-full object-cover [image-rendering:pixelated]"
              />
            </button>
            <span className="text-3xs font-mono text-text-muted">Light</span>
            {persona.thumbnailFingerprintLight && (
              <button
                onClick={() =>
                  update({ thumbnailFingerprintLight: null, thumbnailDataUrlLight: null })
                }
                className="text-3xs text-error hover:text-text cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleThumbnailUpload('thumbnailFingerprint')}
          />
          <input
            ref={fileLightRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleThumbnailUpload('thumbnailFingerprintLight')}
          />
        </div>
      </div>

      {/* Name */}
      <div className="shrink-0">
        <div className="text-3xs font-mono uppercase tracking-wider text-text-muted mb-1.5">
          Name
        </div>
        <input
          type="text"
          value={persona.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Persona name"
          className={inputClass}
          maxLength={50}
        />
      </div>

      {/* Greeting */}
      <div className="shrink-0">
        <div className="text-3xs font-mono uppercase tracking-wider text-text-muted mb-1.5">
          Greeting
        </div>
        <input
          type="text"
          value={persona.greeting}
          onChange={(e) => update({ greeting: e.target.value })}
          placeholder="A greeting shown when the console opens"
          className={inputClass}
          maxLength={200}
        />
      </div>

      {/* System Prompt */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="text-3xs font-mono uppercase tracking-wider text-text-muted mb-1.5 shrink-0">
          System Prompt
        </div>
        <textarea
          value={persona.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="Custom instructions for the AI persona..."
          className={cn(inputClass, 'resize-none flex-1 min-h-[80px]')}
          maxLength={4000}
        />
        <div className="flex items-center justify-between mt-1 shrink-0">
          <p className="text-3xs text-text-muted/50">
            {persona.systemPrompt ? `${persona.systemPrompt.length}/4000` : ''}
          </p>
          {isCustomized && (
            <button
              onClick={handleReset}
              className="text-2xs font-mono text-text-muted hover:text-error cursor-pointer"
            >
              Revert to Default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Background ──────────────────────────────────

function BackgroundTabContent({
  bgType,
  onChangeBgType,
  bgImagePreview,
  onBgImageSelect,
  onBgImageClear,
  onBgGenerate,
  bgGenerating,
  bgError,
}: {
  bgType: BgType;
  onChangeBgType: (t: BgType) => void;
  bgImagePreview: string | null;
  onBgImageSelect: (file: File) => void;
  onBgImageClear: () => void;
  /** Make a backdrop from a description (the same path the agent's set_background uses). */
  onBgGenerate: (prompt: string) => void;
  bgGenerating: boolean;
  bgError: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [bgPrompt, setBgPrompt] = useState('');
  const isLight = getResolvedMode() === 'Light';

  const animatedOptions: {
    value: BgType;
    label: string;
    description: string;
    darkOnly?: boolean;
  }[] = [
    { value: BgType.Bloom, label: 'Bloom', description: 'Animated gradient blobs' },
    { value: BgType.Drift, label: 'Drift', description: 'Floating particles', darkOnly: true },
    { value: BgType.Flow, label: 'Flow', description: 'Organic wave patterns', darkOnly: true },
    { value: BgType.Blank, label: 'Blank', description: 'Solid background color' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-3xs font-mono uppercase tracking-wider text-text-muted">Animated</div>
        <div className="grid grid-cols-2 gap-2">
          {animatedOptions.map(({ value, label, description, darkOnly }) => {
            const disabled = darkOnly && isLight;
            return (
              <button
                key={value}
                onClick={() => !disabled && onChangeBgType(value)}
                disabled={disabled}
                className={cn(
                  'flex flex-col gap-0.5 px-3 py-2.5 rounded-[var(--radius-sm)] border text-left transition-colors',
                  disabled
                    ? 'opacity-30 cursor-not-allowed border-border'
                    : bgType === value
                      ? 'bg-surface text-text border-accent/30 cursor-pointer'
                      : 'bg-transparent border-border text-text-muted hover:border-accent/20 hover:text-text cursor-pointer',
                )}
              >
                <span className="text-xs font-mono font-medium">{label}</span>
                <span className="text-2xs opacity-60">{description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-3xs font-mono uppercase tracking-wider text-text-muted">Image</div>
        <button
          onClick={() => {
            onChangeBgType(BgType.Image);
            if (!bgImagePreview) fileRef.current?.click();
          }}
          className={cn(
            'flex flex-col gap-0.5 px-3 py-2.5 rounded-[var(--radius-sm)] border text-left transition-colors cursor-pointer',
            bgType === 'image'
              ? 'bg-surface text-text border-accent/30'
              : 'bg-transparent border-border text-text-muted hover:border-accent/20 hover:text-text',
          )}
        >
          <span className="text-xs font-mono font-medium">Image</span>
          <span className="text-2xs opacity-60">Upload a background image</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onBgImageSelect(file);
            if (fileRef.current) fileRef.current.value = '';
          }}
        />

        <form
          className="flex flex-col gap-1.5 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (bgPrompt.trim() && !bgGenerating) onBgGenerate(bgPrompt.trim());
          }}
        >
          <label className="text-2xs font-mono uppercase tracking-wider text-caption">
            Describe a backdrop
          </label>
          <div className="flex gap-2">
            <input
              value={bgPrompt}
              onChange={(e) => setBgPrompt(e.target.value)}
              placeholder="fog over a pine forest at dawn, soft, muted"
              aria-label="Backdrop description"
              className="flex-1 h-8 rounded-input border border-input-border bg-input px-2.5 text-xs text-input-text placeholder:text-placeholder focus:outline-none focus:border-input-border-active focus:ring-1 focus:ring-input-outline"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!bgPrompt.trim() || bgGenerating}
              loading={bgGenerating}
            >
              Generate
            </Button>
          </div>
          <p className="text-2xs text-text-muted">
            Uses your image-capable model key (same as the agent). Or pick an image file below.
          </p>
          {bgError && (
            <p role="alert" data-testid="bg-error" className="text-2xs text-error">
              {bgError}
            </p>
          )}
        </form>
        {bgType === 'image' && bgImagePreview && (
          <div className="flex flex-col gap-2 mt-1 p-3 bg-bg border border-border/50 rounded-[var(--radius-sm)]">
            <div className="relative w-full h-28 rounded-[var(--radius-sm)] overflow-hidden">
              <img
                src={bgImagePreview}
                alt="Background preview"
                className="w-full h-full object-cover"
              />
              {bgGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg/60">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="text-2xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
              >
                Change image
              </button>
              <button
                onClick={onBgImageClear}
                className="text-2xs text-error hover:text-error/80 transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {bgType === 'image' && !bgImagePreview && (
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer mt-1"
          >
            Choose an image...
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────

type Tab = 'moods' | 'palette' | 'theme' | 'resonance' | 'assets' | 'background' | 'persona';

interface MoodEditorProps {
  initialTab?: Tab;
  /** The modal: no Theme tab, plus a way into the full Mood Builder page. */
  compact?: boolean;
}

export default function MoodEditor({ initialTab = 'moods', compact = false }: MoodEditorProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => getUserPresets());
  useEffect(() => onUserPresetsChange(() => setUserPresets(getUserPresets())), []);
  const [activeDarkId, setActiveDarkId] = useState(
    () => (getSetting(SettingsKey.MoodPresetDark) as string) || 'obsidian',
  );
  const [activeLightId, setActiveLightId] = useState(
    () => (getSetting(SettingsKey.MoodPresetLight) as string) || 'parchment',
  );

  // Sync preset IDs on mount (component only renders when modal is open)
  useEffect(() => {
    setActiveDarkId((getSetting(SettingsKey.MoodPresetDark) as string) || 'obsidian');
    setActiveLightId((getSetting(SettingsKey.MoodPresetLight) as string) || 'parchment');
  }, []);
  const [bgType, setBgType] = useState<BgType>(() => {
    const saved = getSetting(SettingsKey.BackgroundType) as string | null;
    if (
      saved === 'bloom' ||
      saved === 'blank' ||
      saved === 'drift' ||
      saved === 'flow' ||
      saved === 'image'
    )
      return saved as BgType;
    return BgType.Bloom;
  });
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(null);
  // Object URL created for the preview — revoked when replaced or on unmount
  const bgObjectUrlRef = useRef<string | null>(null);
  const releaseBgObjectUrl = () => {
    const url = bgObjectUrlRef.current;
    if (!url) return;
    bgObjectUrlRef.current = null;
    // Don't revoke a URL the app background is still displaying
    if (useMoodStore.getState().backgroundUrl !== url) URL.revokeObjectURL(url);
  };
  // Resolve background image fingerprint to blob URL on mount
  useEffect(() => {
    const fp = getSetting(SettingsKey.BackgroundImage) as string | null;
    if (!fp) return;
    (async () => {
      const { blobObjectUrl } = await import('@/services/blobs');
      const url = await blobObjectUrl(fp).catch(() => null);
      if (url) {
        releaseBgObjectUrl();
        bgObjectUrlRef.current = url;
        setBgImagePreview(url);
      }
    })();
    // Revoke the created object URL on unmount
    return () => releaseBgObjectUrl();
  }, []);
  const [bgGenerating, setBgGenerating] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const handleBgGenerate = async (prompt: string) => {
    setBgGenerating(true);
    setBgError(null);
    try {
      const { generateImageBlob } = await import('@/ai/tools');
      const result = await generateImageBlob(prompt, '1536x1024');
      if ('error' in result) {
        setBgError(result.error);
        return;
      }
      const { setBackgroundFromBlob, setBackgroundType } = await import('@/services/background');
      await setBackgroundType(BgType.Image);
      await setBackgroundFromBlob(result.blob);
      setBgType(BgType.Image);
    } catch (err) {
      setBgError((err as Error).message || 'Could not generate a backdrop');
    } finally {
      setBgGenerating(false);
    }
  };

  const handleBgChange = (type: BgType) => {
    setBgType(type);
    void import('@/services/background').then(({ setBackgroundType }) => setBackgroundType(type));
    if (type === 'image' && bgImagePreview) {
      useMoodStore.setState({ backgroundUrl: bgImagePreview });
    }
  };

  const handleBgImageSelect = async (file: File) => {
    setBgGenerating(true);
    try {
      const { setBackgroundFromBlob } = await import('@/services/background');
      const url = await setBackgroundFromBlob(file);
      releaseBgObjectUrl();
      bgObjectUrlRef.current = url || null;
      setBgImagePreview(url || null);
      setBgType(BgType.Image);
    } finally {
      setBgGenerating(false);
    }
  };

  const handleBgImageClear = () => {
    setBgImagePreview(null);
    void import('@/services/background').then(({ clearBackgroundImage }) => clearBackgroundImage());
    setBgType(BgType.Bloom);
    releaseBgObjectUrl();
  };

  const handleSelect = (preset: MoodPresetDef) => {
    // Save to the correct mode key
    if (preset.section === 'Light') {
      setActiveLightId(preset.id);
      setSetting(SettingsKey.MoodPresetLight, preset.id);
    } else {
      setActiveDarkId(preset.id);
      setSetting(SettingsKey.MoodPresetDark, preset.id);
    }
    // Switch mode if needed, otherwise just apply
    const currentMode = getResolvedMode();
    if (preset.section !== currentMode) {
      import('@/stores/themeStore').then(({ useThemeStore }) => {
        useThemeStore
          .getState()
          .setMode(preset.section === 'Light' ? ThemeMode.Light : ThemeMode.Dark);
      });
    } else {
      // Preset + the user's custom tokens for this mode
      applyActiveMood(preset.section);
    }
  };

  return (
    <div className="select-none flex-1 flex flex-col min-h-0">
      {/* Tabs */}
      <div className="flex items-center gap-1 pb-3 mb-3 border-b border-border shrink-0">
        {(
          [
            ['moods', 'Moods'],
            ['palette', 'Themes'],
            ['theme', 'Tokens'],
            ['resonance', 'Resonance'],
            ['assets', 'Assets'],
            ['background', 'Background'],
            ['persona', 'Persona'],
          ] as const
        )
          .filter(
            ([t]) =>
              !(
                compact &&
                (t === 'theme' || t === 'resonance' || t === 'background' || t === 'persona')
              ),
          )
          .map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-2.5 py-1 text-xs font-display font-medium rounded-[var(--radius-sm)] cursor-pointer',
                tab === t ? 'text-text bg-surface' : 'text-text-muted hover:text-text',
              )}
            >
              {label}
            </button>
          ))}
        {compact && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                useUIStore.getState().setMoodPanelOpen(false);
                navigate('/mood?tab=theme');
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-body rounded-[var(--radius-sm)] border border-border bg-surface text-text hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              Open Mood Builder
              <span aria-hidden>→</span>
            </button>
          </>
        )}
      </div>

      {/* Active tab content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        {tab === 'palette' && (
          <div>
            {userPresets.length > 0 && (
              <div className="mb-4">
                <div className="text-3xs font-mono uppercase tracking-wider text-text-muted mb-2">
                  Yours
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {userPresets.map((preset) => {
                    const active =
                      (preset.section === 'Dark' ? activeDarkId : activeLightId) === preset.id;
                    return (
                      <div key={preset.id} className="relative group">
                        <button
                          onClick={() => handleSelect(preset)}
                          className="w-full flex flex-col items-center gap-1.5 cursor-pointer"
                        >
                          <PresetThumb preset={preset} active={active} />
                          <span
                            className={cn(
                              'text-2xs font-mono transition-colors truncate max-w-full',
                              active ? 'text-text' : 'text-text-muted group-hover:text-text',
                            )}
                          >
                            {preset.name}
                          </span>
                        </button>
                        <button
                          onClick={() => deleteUserPreset(preset.id)}
                          aria-label={`Delete preset ${preset.name}`}
                          title="Delete this preset"
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-surface-solid border border-border text-text-muted hover:text-error text-xs leading-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {(['Dark', 'Light'] as const).map((section) => {
              const sectionPresets = MOOD_PRESETS.filter((p) => p.section === section);
              const activeForSection = section === 'Dark' ? activeDarkId : activeLightId;
              if (sectionPresets.length === 0) return null;
              return (
                <div key={section} className={section !== 'Dark' ? 'mt-4' : ''}>
                  <div className="text-3xs font-mono uppercase tracking-wider text-text-muted mb-2">
                    {section}
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {sectionPresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleSelect(preset)}
                        className="flex flex-col items-center gap-1.5 cursor-pointer group"
                      >
                        <PresetThumb preset={preset} active={activeForSection === preset.id} />
                        <span
                          className={cn(
                            'text-2xs font-mono transition-colors',
                            activeForSection === preset.id
                              ? 'text-text'
                              : 'text-text-muted group-hover:text-text',
                          )}
                        >
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'background' && (
          <BackgroundTabContent
            bgType={bgType}
            onChangeBgType={handleBgChange}
            bgImagePreview={bgImagePreview}
            onBgImageSelect={handleBgImageSelect}
            onBgImageClear={handleBgImageClear}
            bgGenerating={bgGenerating}
            bgError={bgError}
            onBgGenerate={(p) => void handleBgGenerate(p)}
          />
        )}
        {tab === 'moods' && <MoodBrowser />}
        {tab === 'theme' && <ThemeTokensTab />}
        {tab === 'resonance' && <ResonanceTab />}
        {tab === 'assets' && <AssetsTab />}
        {tab === 'persona' && <PersonaTab />}
      </div>
    </div>
  );
}
