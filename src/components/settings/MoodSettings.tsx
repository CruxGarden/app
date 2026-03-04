import { useState, useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { getCurrentPalette, type Palette } from '@/lib/palette';
import { Panel, Toggle } from '@/components/ui';
import { cn } from '@/lib/cn';

type BgType = 'bloom' | 'flowfield' | 'drift';

const BG_STORAGE_KEY = 'cruxgarden:backgroundType';

function getBackgroundType(): BgType {
  const saved = localStorage.getItem(BG_STORAGE_KEY);
  if (saved === 'bloom' || saved === 'flowfield' || saved === 'drift') return saved;
  const css =
    getComputedStyle(document.documentElement)
      .getPropertyValue('--background-type')
      .trim();
  if (css === 'flowfield' || css === 'drift') return css;
  return 'bloom';
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

function BloomPreview() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
      <circle cx="6" cy="5" r="4" fill="var(--accent)" opacity="0.4" />
      <circle cx="14" cy="9" r="4" fill="var(--accent)" opacity="0.25" />
      <circle cx="10" cy="4" r="3" fill="var(--accent)" opacity="0.15" />
    </svg>
  );
}

function FlowFieldPreview() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
      <path d="M2 8 C5 4, 8 4, 10 7 S15 12, 18 8" stroke="var(--accent)" strokeWidth="0.8" fill="none" opacity="0.6" />
      <path d="M1 11 C4 7, 7 6, 10 9 S14 14, 19 10" stroke="var(--accent)" strokeWidth="0.6" fill="none" opacity="0.35" />
      <path d="M3 5 C6 2, 9 2, 12 5 S16 9, 19 5" stroke="var(--accent)" strokeWidth="0.6" fill="none" opacity="0.4" />
    </svg>
  );
}

function DriftPreview() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
      <circle cx="4" cy="3" r="1" fill="var(--accent)" opacity="0.7" />
      <circle cx="16" cy="11" r="0.8" fill="var(--accent)" opacity="0.5" />
      <circle cx="10" cy="7" r="1.5" fill="var(--accent)" opacity="0.4" />
      <circle cx="14" cy="2" r="0.6" fill="var(--accent)" opacity="0.3" />
      <circle cx="7" cy="11" r="0.7" fill="var(--accent)" opacity="0.6" />
      <circle cx="17" cy="6" r="0.5" fill="var(--accent)" opacity="0.35" />
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
    label: 'Bloom',
    keys: [
      { key: 'bloomBg1', name: 'bloomBg1' },
      { key: 'bloomBg2', name: 'bloomBg2' },
      { key: 'bloom1', name: 'bloom1' },
      { key: 'bloom2', name: 'bloom2' },
      { key: 'bloom3', name: 'bloom3' },
      { key: 'bloom4', name: 'bloom4' },
      { key: 'bloom5', name: 'bloom5' },
    ],
  },
  {
    label: 'Flow Field',
    keys: [{ key: 'flowColor', name: 'flowColor' }],
  },
  {
    label: 'Drift',
    keys: [
      { key: 'driftColor', name: 'driftColor' },
      { key: 'driftGlow', name: 'driftGlow' },
      { key: 'driftBg', name: 'driftBg' },
    ],
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
  const [bgType, setBgType] = useState<BgType>(getBackgroundType);
  const [collapsed, setCollapsed] = useState(true);

  const handleBgChange = (type: BgType) => {
    setBackgroundType(type);
    setBgType(type);
    document.dispatchEvent(new Event('palette-change'));
  };

  return (
    <Panel padding="md">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full cursor-pointer group"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-text-muted transition-transform duration-150',
            collapsed ? '-rotate-90' : 'rotate-0',
          )}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <h2 className="font-display text-sm font-medium text-accent">Mood</h2>
      </button>

      {!collapsed && <div className="flex flex-col gap-5 mt-5">
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
              active={bgType === 'bloom'}
              onClick={() => handleBgChange('bloom')}
              icon={<BloomPreview />}
              label="Bloom"
            />
            <OptionButton
              active={bgType === 'flowfield'}
              onClick={() => handleBgChange('flowfield')}
              icon={<FlowFieldPreview />}
              label="Flow"
            />
            <OptionButton
              active={bgType === 'drift'}
              onClick={() => handleBgChange('drift')}
              icon={<DriftPreview />}
              label="Drift"
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
      </div>}
    </Panel>
  );
}
