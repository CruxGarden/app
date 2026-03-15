import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { applyMoodPalette, GARDEN_DARK } from '@/lib/moods';
import { useUIStore } from '@/stores/uiStore';
import { getSetting, setSetting } from '@/services/settings';

// ── Preset palettes ──────────────────────────────────

interface Preset {
  id: string;
  name: string;
  overrides: Record<string, string>;
}

const PRESETS: Preset[] = [
  // ── Dark ───────────────────────────────────────────
  {
    id: 'garden',
    name: 'Garden',
    overrides: {},
  },
  {
    // True black, white accent, pure contrast
    id: 'void',
    name: 'Void',
    overrides: {
      bg: '#000000', surface: '#060606', panel: '#0a0a0a',
      accent: '#ffffff', border: 'rgba(255,255,255,0.06)',
      text: '#d8d8d8', textMuted: '#555555',
      paneCollaboration: '#d0d0d0', paneArtifacts: '#b0b0b0', paneWorkshop: '#909090',
      paneDetails: '#d0d0d0', paneHistory: '#b0b0b0', paneExport: '#909090',
      paneSync: '#d0d0d0', panePublish: '#b0b0b0',
    },
  },
  {
    // Neon arcade — pitch black, electric candy
    id: 'neon',
    name: 'Neon',
    overrides: {
      bg: '#020204', surface: '#080810', panel: '#0a0a14',
      accent: '#00ffaa', border: 'rgba(0,255,170,0.08)',
      text: '#e8f0f0', textMuted: '#405060',
      paneCollaboration: '#ff2070', paneArtifacts: '#ff6010', paneWorkshop: '#ffcc00',
      paneDetails: '#00ffaa', paneHistory: '#00ccff', paneExport: '#2060ff',
      paneSync: '#aa40ff', panePublish: '#ff20aa',
    },
  },
  {
    // Deep ocean — navy panels lighter than bg, submarine glass
    id: 'abyss',
    name: 'Abyss',
    overrides: {
      bg: '#040810', surface: '#081420', panel: '#0c1c2c',
      accent: '#40c8c0', border: 'rgba(64,200,192,0.12)',
      text: '#b0d8e0', textMuted: '#4878888',
      paneCollaboration: '#e07080', paneArtifacts: '#d8a048', paneWorkshop: '#c8c040',
      paneDetails: '#40c8c0', paneHistory: '#48a8e0', paneExport: '#6080d8',
      paneSync: '#9068c8', panePublish: '#d060a0',
    },
  },
  {
    // Warm firelight — amber glow, burnt panels
    id: 'hearth',
    name: 'Hearth',
    overrides: {
      bg: '#100804', surface: '#1c1208', panel: '#281c0c',
      accent: '#e8a040', border: 'rgba(200,140,40,0.15)',
      text: '#f0dcc0', textMuted: '#907850',
      paneCollaboration: '#d87050', paneArtifacts: '#e8a040', paneWorkshop: '#c8b830',
      paneDetails: '#80b050', paneHistory: '#50a880', paneExport: '#5090b0',
      paneSync: '#9070a0', panePublish: '#c06080',
    },
  },
  {
    // Violet cathedral — deep purple, gold highlights
    id: 'regal',
    name: 'Regal',
    overrides: {
      bg: '#0a0610', surface: '#140e1c', panel: '#1c1428',
      accent: '#d4a840', border: 'rgba(160,120,40,0.15)',
      text: '#e0d0c8', textMuted: '#806898',
      paneCollaboration: '#d06878', paneArtifacts: '#d4a840', paneWorkshop: '#b8b040',
      paneDetails: '#58b870', paneHistory: '#48a8b8', paneExport: '#5888d0',
      paneSync: '#9868c0', panePublish: '#c860a0',
    },
  },
  // ── Mid-tone ───────────────────────────────────────
  {
    // Solarized — teal base, warm/cool split
    id: 'solaris',
    name: 'Solaris',
    overrides: {
      bg: '#002830', surface: '#003840', panel: '#004850',
      accent: '#b58900', border: 'rgba(88,110,117,0.30)',
      text: '#93a1a1', textMuted: '#586e75',
      paneCollaboration: '#dc322f', paneArtifacts: '#cb4b16', paneWorkshop: '#b58900',
      paneDetails: '#859900', paneHistory: '#2aa198', paneExport: '#268bd2',
      paneSync: '#6c71c4', panePublish: '#d33682',
    },
  },
  {
    // Military olive — dark green panels, tan accent
    id: 'bunker',
    name: 'Bunker',
    overrides: {
      bg: '#0c0e08', surface: '#161a10', panel: '#202818',
      accent: '#c8b878', border: 'rgba(120,130,80,0.20)',
      text: '#d8d8c0', textMuted: '#808870',
      paneCollaboration: '#b87060', paneArtifacts: '#c8a050', paneWorkshop: '#a0a840',
      paneDetails: '#60a868', paneHistory: '#509898', paneExport: '#6888a8',
      paneSync: '#8878a0', panePublish: '#a87080',
    },
  },
  // ── Light ──────────────────────────────────────────
  {
    // Warm parchment — old book feel
    id: 'parchment',
    name: 'Parchment',
    overrides: {
      bg: '#f4ece0', surface: '#ece2d4', panel: '#e4d8c8',
      accent: '#886838', border: 'rgba(100,70,30,0.18)',
      text: '#2c2010', textMuted: '#887058',
      paneCollaboration: '#b05040', paneArtifacts: '#a07028', paneWorkshop: '#808018',
      paneDetails: '#407830', paneHistory: '#307068', paneExport: '#406090',
      paneSync: '#685088', panePublish: '#904860',
    },
  },
  {
    // Cool sky — open air, bright blues
    id: 'sky',
    name: 'Sky',
    overrides: {
      bg: '#e8f0f8', surface: '#dce8f4', panel: '#d0e0f0',
      accent: '#2870c0', border: 'rgba(40,80,160,0.12)',
      text: '#101830', textMuted: '#5070a0',
      paneCollaboration: '#c04858', paneArtifacts: '#c07828', paneWorkshop: '#909010',
      paneDetails: '#208848', paneHistory: '#188080', paneExport: '#2870c0',
      paneSync: '#5850a8', panePublish: '#a04878',
    },
  },
  {
    // Cherry blossom — pale pink, soft natural greens
    id: 'blossom',
    name: 'Blossom',
    overrides: {
      bg: '#f8eff2', surface: '#f0e4ea', panel: '#e8d8e0',
      accent: '#c06888', border: 'rgba(160,80,100,0.12)',
      text: '#281018', textMuted: '#907080',
      paneCollaboration: '#c06070', paneArtifacts: '#b88038', paneWorkshop: '#889020',
      paneDetails: '#409858', paneHistory: '#308880', paneExport: '#4870a8',
      paneSync: '#7858a0', panePublish: '#c05878',
    },
  },
  {
    // Pure white — maximum brightness, minimal color
    id: 'snow',
    name: 'Snow',
    overrides: {
      bg: '#ffffff', surface: '#f8f8f8', panel: '#f0f0f0',
      accent: '#222222', border: 'rgba(0,0,0,0.08)',
      text: '#111111', textMuted: '#808080',
      paneCollaboration: '#444444', paneArtifacts: '#555555', paneWorkshop: '#444444',
      paneDetails: '#555555', paneHistory: '#444444', paneExport: '#555555',
      paneSync: '#444444', panePublish: '#555555',
    },
  },
  {
    // Geocities — teal background, bright clashing 90s web colors, unapologetic
    id: 'geocities',
    name: 'Geocities',
    overrides: {
      bg: '#008080', surface: '#006868', panel: '#005858',
      accent: '#ffff00', border: 'rgba(255,255,255,0.20)',
      text: '#ffffff', textMuted: '#c0e0e0',
      paneCollaboration: '#ff0000', paneArtifacts: '#ff8800', paneWorkshop: '#ffff00',
      paneDetails: '#00ff00', paneHistory: '#00ffff', paneExport: '#0088ff',
      paneSync: '#8800ff', panePublish: '#ff00ff',
    },
  },
  {
    // Photoshop — that specific medium gray UI with sharp blue accent
    id: 'darkroom',
    name: 'Darkroom',
    overrides: {
      bg: '#1e1e1e', surface: '#2d2d2d', panel: '#383838',
      accent: '#2d9cdb', border: 'rgba(0,0,0,0.40)',
      text: '#cccccc', textMuted: '#808080',
      paneCollaboration: '#6cb4ee', paneArtifacts: '#e8a848', paneWorkshop: '#7eb84c',
      paneDetails: '#6cb4ee', paneHistory: '#a0a0a0', paneExport: '#c878c0',
      paneSync: '#6cb4ee', panePublish: '#e86880',
    },
  },
  {
    // Café in the rain — warm wood, condensation on glass, amber lamplight
    id: 'cafe',
    name: 'Café',
    overrides: {
      bg: '#1a1410', surface: '#24201a', panel: '#2e2820',
      accent: '#d8a860', border: 'rgba(160,130,80,0.18)',
      text: '#e0d0b8', textMuted: '#887860',
      paneCollaboration: '#c08868', paneArtifacts: '#d8a860', paneWorkshop: '#b8a868',
      paneDetails: '#88a878', paneHistory: '#80a098', paneExport: '#7890a0',
      paneSync: '#a08888', panePublish: '#b88080',
    },
  },
];

const OVERRIDES_KEY = 'cruxgarden:moodPreset';

/**
 * Apply saved mood preset on app startup.
 */
export function applySavedMoodSettings() {
  const savedId = getSetting(OVERRIDES_KEY) as string | null;
  if (!savedId) return;
  const preset = PRESETS.find((p) => p.id === savedId);
  if (preset) {
    applyMoodPalette(preset.overrides);
  }
}

// ── Preset thumbnail ─────────────────────────────────

function PresetThumb({ preset, active }: { preset: Preset; active: boolean }) {
  const p = (key: string) => preset.overrides[key] || (GARDEN_DARK as Record<string, string>)[key] || '#888';

  return (
    <div
      className={cn(
        'w-full rounded-[4px] overflow-hidden border-2 transition-all',
        active ? 'border-white' : 'border-[#333] hover:border-[#666]',
      )}
    >
      {/* Mini app mockup */}
      <div className="flex flex-col" style={{ backgroundColor: p('bg'), height: 64 }}>
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
          {/* Chat column */}
          <div className="flex-1 flex flex-col justify-end gap-0.5">
            <div className="self-end w-3/4 h-1.5 rounded-[1px]" style={{ backgroundColor: `color-mix(in srgb, ${p('accent')} 15%, transparent)` }} />
            <div className="self-start w-2/3 h-1.5 rounded-[1px]" style={{ backgroundColor: p('surface') }} />
          </div>
          {/* Sidebar */}
          <div className="w-4" style={{ backgroundColor: p('panel'), borderLeft: `1px solid ${p('border')}` }}>
            <div className="mt-0.5 mx-0.5 h-1 rounded-[1px]" style={{ backgroundColor: p('accent'), opacity: 0.5 }} />
            <div className="mt-0.5 mx-0.5 h-1 rounded-[1px]" style={{ backgroundColor: p('surface') }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────

export default function MoodBar() {
  const open = useUIStore((s) => s.moodEditorOpen);
  const close = useCallback(() => useUIStore.getState().setMoodEditorOpen(false), []);

  const [activeId, setActiveId] = useState(() => (getSetting(OVERRIDES_KEY) as string) || 'garden');

  const handleSelect = (preset: Preset) => {
    setActiveId(preset.id);
    setSetting(OVERRIDES_KEY, preset.id);
    applyMoodPalette(preset.overrides);
  };

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] bg-[#1a1a1a] border border-[#333] rounded-[var(--radius)] shadow-2xl p-4 select-none w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-display font-medium text-[#ccc]">Mood</span>
        <button onClick={close} className="text-[#666] hover:text-[#ccc] cursor-pointer transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-5 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleSelect(preset)}
            className="flex flex-col items-center gap-1.5 cursor-pointer group"
          >
            <PresetThumb preset={preset} active={activeId === preset.id} />
            <span className={cn(
              'text-[10px] font-mono transition-colors',
              activeId === preset.id ? 'text-[#ccc]' : 'text-[#666] group-hover:text-[#999]',
            )}>
              {preset.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
