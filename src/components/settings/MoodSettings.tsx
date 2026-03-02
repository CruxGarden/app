import { useState, useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { getCurrentPalette, type Palette } from '@/lib/palette';
import { Panel, Toggle } from '@/components/ui';
import { cn } from '@/lib/cn';

type BgType = 'mesh' | 'starfield';

const BG_STORAGE_KEY = 'cruxgarden:backgroundType';

function getBackgroundType(): BgType {
  const saved = localStorage.getItem(BG_STORAGE_KEY);
  if (saved === 'mesh' || saved === 'starfield') return saved;
  const css =
    getComputedStyle(document.documentElement)
      .getPropertyValue('--background-type')
      .trim();
  if (css === 'starfield') return css;
  return 'mesh';
}

function setBackgroundType(type: BgType) {
  localStorage.setItem(BG_STORAGE_KEY, type);
  document.documentElement.style.setProperty('--background-type', type);
}

// ── Icons ──────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

// ── Section Label ──────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
      {children}
    </span>
  );
}

// ── Option Button (for theme + background pickers) ─

function OptionButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)] transition-colors cursor-pointer',
        active
          ? 'bg-accent-muted text-accent border border-accent/30'
          : 'bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-solid',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Background Previews ────────────────────────────

function MeshPreview() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
      <circle cx="6" cy="5" r="4" fill="var(--accent)" opacity="0.4" />
      <circle cx="14" cy="9" r="4" fill="var(--accent)" opacity="0.25" />
      <circle cx="10" cy="4" r="3" fill="var(--accent)" opacity="0.15" />
    </svg>
  );
}

function StarfieldPreview() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
      <circle cx="3" cy="3" r="0.8" fill="currentColor" opacity="0.7" />
      <circle cx="10" cy="6" r="0.6" fill="currentColor" opacity="0.5" />
      <circle cx="17" cy="2" r="0.8" fill="currentColor" opacity="0.8" />
      <circle cx="7" cy="11" r="0.6" fill="currentColor" opacity="0.4" />
      <circle cx="14" cy="10" r="0.7" fill="currentColor" opacity="0.6" />
      <circle cx="5" cy="7" r="0.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

// ── Palette Table ──────────────────────────────────

type PaletteGroup = { label: string; keys: { key: keyof Palette; name: string }[] };

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    label: 'Colors',
    keys: [
      { key: 'bg', name: 'bg' },
      { key: 'surface', name: 'surface' },
      { key: 'surfaceSolid', name: 'surfaceSolid' },
      { key: 'panel', name: 'panel' },
      { key: 'text', name: 'text' },
      { key: 'textMuted', name: 'textMuted' },
      { key: 'border', name: 'border' },
      { key: 'accent', name: 'accent' },
      { key: 'accentMuted', name: 'accentMuted' },
      { key: 'error', name: 'error' },
      { key: 'errorMuted', name: 'errorMuted' },
    ],
  },
  {
    label: 'Chrome',
    keys: [
      { key: 'contrast', name: 'contrast' },
      { key: 'overlay', name: 'overlay' },
      { key: 'previewBg', name: 'previewBg' },
    ],
  },
  {
    label: 'Brand',
    keys: [{ key: 'brandAi', name: 'brandAi' }],
  },
  {
    label: 'Mesh',
    keys: [
      { key: 'meshBg1', name: 'meshBg1' },
      { key: 'meshBg2', name: 'meshBg2' },
      { key: 'mesh1', name: 'mesh1' },
      { key: 'mesh2', name: 'mesh2' },
      { key: 'mesh3', name: 'mesh3' },
      { key: 'mesh4', name: 'mesh4' },
      { key: 'mesh5', name: 'mesh5' },
    ],
  },
  {
    label: 'Starfield',
    keys: [{ key: 'starColor', name: 'starColor' }],
  },
  {
    label: 'Syntax',
    keys: [
      { key: 'syntaxComment', name: 'syntaxComment' },
      { key: 'syntaxKeyword', name: 'syntaxKeyword' },
      { key: 'syntaxString', name: 'syntaxString' },
      { key: 'syntaxNumber', name: 'syntaxNumber' },
      { key: 'syntaxType', name: 'syntaxType' },
      { key: 'syntaxFunction', name: 'syntaxFunction' },
      { key: 'syntaxPunctuation', name: 'syntaxPunctuation' },
    ],
  },
];

function PaletteTable() {
  const [palette, setPalette] = useState<Palette>(getCurrentPalette);

  useEffect(() => {
    const handler = () => setPalette(getCurrentPalette());
    document.addEventListener('palette-change', handler);
    return () => document.removeEventListener('palette-change', handler);
  }, []);

  let rowIndex = 0;

  return (
    <div className="border border-border rounded-[var(--radius)] overflow-hidden">
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-2 py-1.5 text-text-muted font-normal w-6" />
            <th className="text-left px-2 py-1.5 text-text-muted font-normal">Name</th>
            <th className="text-left px-2 py-1.5 text-text-muted font-normal">Value</th>
          </tr>
        </thead>
        <tbody>
          {PALETTE_GROUPS.map((group) => (
            <>
              <tr key={`h-${group.label}`} className="border-t border-border/50">
                <td
                  colSpan={3}
                  className="px-2 py-1 text-[9px] uppercase tracking-wider text-text-muted/60 bg-surface/50"
                >
                  {group.label}
                </td>
              </tr>
              {group.keys.map(({ key, name }) => {
                const value = palette[key];
                const even = rowIndex++ % 2 === 0;
                return (
                  <tr key={key} className={even ? 'bg-transparent' : 'bg-surface/30'}>
                    <td className="px-2 py-1">
                      <div
                        className="w-4 h-4 rounded-[3px] border border-border/50 shrink-0"
                        style={{ backgroundColor: value }}
                      />
                    </td>
                    <td className="px-2 py-1 text-text">{name}</td>
                    <td className="px-2 py-1 text-text-muted truncate max-w-[180px]">{value}</td>
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ─────────────────────────────────

export default function MoodSettings() {
  const { mode, setMode } = useThemeStore();
  const bgType = getBackgroundType();

  const handleBgChange = (type: BgType) => {
    setBackgroundType(type);
    // Force a re-render by dispatching the palette-change event
    document.dispatchEvent(new Event('palette-change'));
  };

  return (
    <Panel padding="md">
      <h2 className="font-display text-sm font-medium text-accent mb-5">Mood</h2>

      <div className="flex flex-col gap-5">
        {/* ── Theme ── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Theme</SectionLabel>
          <div className="flex items-center gap-2">
            <OptionButton
              active={mode === 'dark'}
              onClick={() => setMode('dark')}
              icon={<MoonIcon />}
              label="Dark"
            />
            <OptionButton
              active={mode === 'light'}
              onClick={() => setMode('light')}
              icon={<SunIcon />}
              label="Light"
            />
            <OptionButton
              active={mode === 'auto'}
              onClick={() => setMode('auto')}
              icon={<MonitorIcon />}
              label="System"
            />
          </div>
        </div>

        {/* ── Background ── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Background</SectionLabel>
          <div className="flex items-center gap-2">
            <OptionButton
              active={bgType === 'mesh'}
              onClick={() => handleBgChange('mesh')}
              icon={<MeshPreview />}
              label="Mesh"
            />
            <OptionButton
              active={bgType === 'starfield'}
              onClick={() => handleBgChange('starfield')}
              icon={<StarfieldPreview />}
              label="Stars"
            />
          </div>
        </div>

        {/* ── Audio ── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Audio</SectionLabel>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Ambient sounds</span>
            <Toggle checked={false} onChange={() => {}} disabled label="" />
          </div>
          <p className="text-[10px] text-text-muted/60">Coming soon</p>
        </div>

        {/* ── Palette ── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Palette</SectionLabel>
          <PaletteTable />
        </div>
      </div>
    </Panel>
  );
}
