import { useState, useEffect, useRef } from 'react';
import { SectionLabel } from '@/components/ui';
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
import SoundTab from './SoundTab';
import MotionIntensityControl from './MotionIntensityControl';
import FlowControl from './FlowControl';
import AppearanceControls from './AppearanceControls';
import SurfaceThemeControl from './SurfaceThemeControl';
import MoodBrowser from './MoodBrowser';
import GardenMoodLine, { KeepLook } from './GardenMoodLine';
import AssetsTab from './AssetsTab';
import { useMoodStore } from '@/stores/moodStore';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { BgType, ThemeMode } from '@/lib/types';
import { getResolvedMode } from './mood-helpers';
import { BackgroundTabContent, Tab } from './BackgroundTab';
import { PersonaTab } from './PersonaTab';

// ── Preset thumbnail ─────────────────────────────────

function PresetThumb({ preset, active }: { preset: MoodPresetDef; active: boolean }) {
  const p = (key: string) =>
    preset.overrides[key] || (GARDEN_DARK as Record<string, string>)[key] || '#888';

  return (
    <div
      className={cn(
        'w-full rounded-[6px] p-[2px] transition-colors',
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


export default function MoodEditor() {
  const [tab, setTab] = useState<Tab>(() => useUIStore.getState().moodTab ?? 'moods');
  const requested = useUIStore((s) => s.moodTab);
  useEffect(() => {
    if (!requested) return;
    setTab(requested);
    useUIStore.setState({ moodTab: null });
  }, [requested]);
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => getUserPresets());
  useEffect(() => onUserPresetsChange(() => setUserPresets(getUserPresets())), []);
  const [activeDarkId, setActiveDarkId] = useState(
    () => (getSetting(SettingsKey.MoodPresetDark) as string) || 'obsidian',
  );
  const [activeLightId, setActiveLightId] = useState(
    () => (getSetting(SettingsKey.MoodPresetLight) as string) || 'parchment',
  );

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
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pb-3 mb-3 border-b border-border shrink-0">
        {(
          [
            ['moods', 'Moods'],
            ['theme', 'Theme'],
            ['background', 'Background'],
            ['sound', 'Sound'],
            ['persona', 'Persona'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-2.5 py-1 text-xs font-body font-medium rounded-[var(--radius-sm)] cursor-pointer shrink-0',
              tab === t ? 'text-text bg-surface' : 'text-text-muted hover:text-text',
            )}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <SurfaceThemeControl />
        <MotionIntensityControl />
      </div>

      <KeepLook />
      {/* Active tab content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-3">
        {tab === 'theme' && (
          <div className="flex flex-col gap-6">
            <AppearanceControls />
            {userPresets.length > 0 && (
              <div className="mb-4">
                <SectionLabel as="div" tone="muted" className="mb-2">
                  Yours
                </SectionLabel>
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
                  <SectionLabel as="div" tone="muted" className="mb-2">
                    {section}
                  </SectionLabel>
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
            <div>
              <SectionLabel as="div" tone="muted" className="mb-2">
                Tokens
              </SectionLabel>
              <ThemeTokensTab />
            </div>
            <div>
              <SectionLabel as="div" tone="muted" className="mb-2">
                Files
              </SectionLabel>
              <AssetsTab />
            </div>
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
        {tab === 'moods' && (
          <>
            <div className="mb-6">
              <GardenMoodLine />
            </div>
            <FlowControl />
            <MoodBrowser />
          </>
        )}
        {tab === 'sound' && <SoundTab />}
        {tab === 'persona' && <PersonaTab />}
      </div>
    </div>
  );
}
