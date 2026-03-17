import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { applyMoodPalette, GARDEN_DARK } from '@/lib/moods';
import { MOOD_PRESETS, type MoodPresetDef } from '@/lib/moods/presets';
import { useUIStore } from '@/stores/uiStore';
import { getSetting, setSetting } from '@/services/settings';

type BgType = 'bloom' | 'blank';
const BG_KEY = 'cruxgarden:backgroundType';

const DARK_MOOD_KEY = 'cruxgarden:moodPresetDark';
const LIGHT_MOOD_KEY = 'cruxgarden:moodPresetLight';

// ── Persona persistence ─────────────────────────────

export const PERSONA_KEY = 'cruxgarden:persona';

export interface PersonaSettings {
  name: string;
  greeting: string;
  systemPrompt: string;
  thumbnailDataUrl: string | null;
}

const DEFAULT_PERSONA: PersonaSettings = {
  name: '',
  greeting: '',
  systemPrompt: '',
  thumbnailDataUrl: null,
};

/** Read saved persona (returns defaults for any missing fields). */
export function getPersona(): PersonaSettings {
  try {
    const raw = getSetting(PERSONA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PERSONA, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_PERSONA };
}

/** Save persona to settings (SQLite + cache). */
function savePersona(persona: PersonaSettings) {
  setSetting(PERSONA_KEY, JSON.stringify(persona));
}

// ── Mood helpers ────────────────────────────────────

/** Get the current resolved mode (dark or light) */
function getResolvedMode(): 'Dark' | 'Light' {
  return document.documentElement.classList.contains('light') ? 'Light' : 'Dark';
}

/** Get the settings key for the current mode */
function getMoodKey(): string {
  return getResolvedMode() === 'Light' ? LIGHT_MOOD_KEY : DARK_MOOD_KEY;
}

/** Get the active preset ID for the current mode */
export function getActiveMoodId(): string {
  const key = getMoodKey();
  return (getSetting(key) as string) || (getResolvedMode() === 'Light' ? 'parchment' : 'garden');
}

/**
 * Apply saved mood preset for the current mode.
 */
export function applySavedMoodSettings() {
  // Clean up legacy keys from old mood system
  try {
    setSetting('cruxgarden:moodPreset', '');
    setSetting('cruxgarden:moodOverrides', '');
  } catch { /* ignore if settings not ready */ }

  const id = getActiveMoodId();
  const preset = MOOD_PRESETS.find((p) => p.id === id);
  if (preset) applyMoodPalette(preset.overrides);
}

// ── Preset thumbnail ─────────────────────────────────

function PresetThumb({ preset, active }: { preset: MoodPresetDef; active: boolean }) {
  const p = (key: string) => preset.overrides[key] || (GARDEN_DARK as Record<string, string>)[key] || '#888';

  return (
    <div className={cn(
      'w-full rounded-[6px] p-[2px] transition-all',
      active ? 'bg-accent' : 'bg-transparent hover:bg-text-muted/30',
    )}>
      <div className="rounded-[4px] overflow-hidden">
      <div className="flex flex-col" style={{ backgroundColor: p('bg'), height: 60 }}>
        {/* Toolbar */}
        <div className="h-2.5 flex items-center px-1 gap-0.5" style={{ backgroundColor: p('surface'), borderBottom: `1px solid ${p('border')}` }}>
          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: p('accent') }} />
          <div className="flex-1" />
          <div className="flex gap-px">
            {(['paneCollaboration', 'paneArtifacts', 'paneWorkshop', 'paneDetails'] as const).map((k) => (
              <div key={k} className="w-1.5 h-1.5 rounded-[1px]" style={{ backgroundColor: p(k) }} />
            ))}
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 flex p-1 gap-1">
          <div className="flex-1 flex flex-col justify-end gap-0.5">
            <div className="self-end w-3/4 h-1.5 rounded-[1px]" style={{ backgroundColor: `color-mix(in srgb, ${p('accent')} 15%, transparent)` }} />
            <div className="self-start w-2/3 h-1.5 rounded-[1px]" style={{ backgroundColor: p('surface') }} />
          </div>
          <div className="w-4" style={{ backgroundColor: p('panel'), borderLeft: `1px solid ${p('border')}` }}>
            <div className="mt-0.5 mx-0.5 h-1 rounded-[1px]" style={{ backgroundColor: p('accent'), opacity: 0.5 }} />
            <div className="mt-0.5 mx-0.5 h-1 rounded-[1px]" style={{ backgroundColor: p('surface') }} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Persona Tab ──────────────────────────────────────

function PersonaTab() {
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<PersonaSettings>) => {
    const next = { ...persona, ...patch };
    setPersona(next);
    savePersona(next);
  };

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Limit to 256KB for settings storage
    if (file.size > 256 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Resize to 128x128 for compact storage
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        // Cover-fit: crop to square from center
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
        update({ thumbnailDataUrl: canvas.toDataURL('image/webp', 0.8) });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleReset = () => {
    const fresh = { ...DEFAULT_PERSONA };
    setPersona(fresh);
    savePersona(fresh);
  };

  const hasCustomizations = persona.name || persona.greeting || persona.systemPrompt || persona.thumbnailDataUrl;

  const inputClass = cn(
    'w-full bg-bg border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5',
    'text-xs text-text placeholder:text-text-muted/50',
    'focus:outline-none focus:border-accent font-mono',
  );

  return (
    <div className="space-y-4">
      {/* Thumbnail */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-2">Thumbnail</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-16 h-16 shrink-0 rounded-[var(--radius)] border border-border overflow-hidden bg-surface hover:border-accent transition-colors cursor-pointer flex items-center justify-center"
          >
            {persona.thumbnailDataUrl ? (
              <img src={persona.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleThumbnailUpload} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text-muted">Click to upload a custom avatar for your AI companion.</p>
            {persona.thumbnailDataUrl && (
              <button
                onClick={() => update({ thumbnailDataUrl: null })}
                className="text-[10px] text-error hover:text-text cursor-pointer transition-colors mt-1"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-1.5">Name</div>
        <input
          type="text"
          value={persona.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="The Keeper"
          className={inputClass}
          maxLength={50}
        />
      </div>

      {/* Greeting */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-1.5">Greeting</div>
        <input
          type="text"
          value={persona.greeting}
          onChange={(e) => update({ greeting: e.target.value })}
          placeholder="The Keeper tends the garden. Ask anything."
          className={inputClass}
          maxLength={200}
        />
      </div>

      {/* System Prompt */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-1.5">System Prompt</div>
        <textarea
          value={persona.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="Custom instructions for the AI persona..."
          rows={4}
          className={cn(inputClass, 'resize-none')}
          maxLength={4000}
        />
        <p className="text-[9px] text-text-muted/50 mt-1">
          {persona.systemPrompt ? `${persona.systemPrompt.length}/4000` : 'Leave blank for the default Keeper persona.'}
        </p>
      </div>

      {/* Reset */}
      {hasCustomizations && (
        <button
          onClick={handleReset}
          className="text-[10px] font-mono text-text-muted hover:text-error cursor-pointer transition-colors"
        >
          Reset to defaults
        </button>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────

type Tab = 'palette' | 'persona';

export default function MoodBar() {
  const open = useUIStore((s) => s.moodEditorOpen);
  const close = useCallback(() => useUIStore.getState().setMoodEditorOpen(false), []);
  const [tab, setTab] = useState<Tab>('palette');
  const [activeDarkId, setActiveDarkId] = useState(() => (getSetting(DARK_MOOD_KEY) as string) || 'garden');
  const [activeLightId, setActiveLightId] = useState(() => (getSetting(LIGHT_MOOD_KEY) as string) || 'parchment');

  // Re-sync when panel opens
  useEffect(() => {
    if (open) {
      setActiveDarkId((getSetting(DARK_MOOD_KEY) as string) || 'garden');
      setActiveLightId((getSetting(LIGHT_MOOD_KEY) as string) || 'parchment');
    }
  }, [open]);
  const [bgType, setBgType] = useState<BgType>(() => {
    const saved = getSetting(BG_KEY) as string | null;
    if (saved === 'bloom' || saved === 'blank') return saved;
    return 'bloom';
  });

  const handleBgChange = (type: BgType) => {
    setBgType(type);
    setSetting(BG_KEY, type);
    document.documentElement.style.setProperty('--background-type', type);
  };

  const handleSelect = (preset: MoodPresetDef) => {
    // Save to the correct mode key
    if (preset.section === 'Light') {
      setActiveLightId(preset.id);
      setSetting(LIGHT_MOOD_KEY, preset.id);
    } else {
      setActiveDarkId(preset.id);
      setSetting(DARK_MOOD_KEY, preset.id);
    }
    // Switch mode if needed, otherwise just apply
    const currentMode = getResolvedMode();
    if (preset.section !== currentMode) {
      import('@/stores/themeStore').then(({ useThemeStore }) => {
        useThemeStore.getState().setMode(preset.section === 'Light' ? 'light' : 'dark');
      });
    } else {
      applyMoodPalette(preset.overrides);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] bg-panel border border-panel-border rounded-[var(--radius)] shadow-2xl p-4 select-none w-[400px] max-h-[80vh] overflow-y-auto">
      {/* Header with tabs */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          {(['palette', 'persona'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-2.5 py-1 text-xs font-display font-medium rounded-[var(--radius-sm)] cursor-pointer transition-colors',
                tab === t
                  ? 'text-text bg-surface'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {t === 'palette' ? 'Palette' : 'Persona'}
            </button>
          ))}
        </div>
        <button onClick={close} className="text-text-muted hover:text-text cursor-pointer transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Both tabs rendered in same grid cell — taller one sets panel height */}
      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
        <div className={tab !== 'palette' ? 'invisible pointer-events-none' : undefined}>
          {/* Background */}
          <div className="mb-4">
            <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-2">Background</div>
            <div className="flex gap-1.5">
              {([
                { value: 'blank' as BgType, label: 'Blank' },
                { value: 'bloom' as BgType, label: 'Bloom' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleBgChange(value)}
                  className={cn(
                    'px-2.5 py-1 text-[10px] font-mono rounded-[3px] border cursor-pointer transition-colors',
                    bgType === value
                      ? 'bg-surface text-text border-border'
                      : 'text-text-muted border-border hover:text-text hover:border-accent',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Presets */}
          {(['Dark', 'Light'] as const).map((section) => {
            const sectionPresets = MOOD_PRESETS.filter((p) => p.section === section);
            const activeForSection = section === 'Dark' ? activeDarkId : activeLightId;
            if (sectionPresets.length === 0) return null;
            return (
              <div key={section} className={section !== 'Dark' ? 'mt-4' : ''}>
                <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-2">{section}</div>
                <div className="grid grid-cols-5 gap-2">
                  {sectionPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleSelect(preset)}
                      className="flex flex-col items-center gap-1.5 cursor-pointer group"
                    >
                      <PresetThumb preset={preset} active={activeForSection === preset.id} />
                      <span className={cn(
                        'text-[10px] font-mono transition-colors',
                        activeForSection === preset.id ? 'text-text' : 'text-text-muted group-hover:text-text',
                      )}>
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className={tab !== 'persona' ? 'invisible pointer-events-none' : undefined}>
          <PersonaTab />
        </div>
      </div>
    </div>
  );
}
