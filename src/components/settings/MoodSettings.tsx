import React, { useState, useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useMoodStore } from '@/stores/moodStore';
import { getCurrentMoodPalette, type MoodPalette } from '@/lib/moods';
import { getSetting, setSetting } from '@/services/settings';
import { Panel, Toggle } from '@/components/ui';
import { cn } from '@/lib/cn';
import MoodEditorModal from '@/components/mood/MoodEditorModal';

type BgType = 'bloom' | 'flowfield' | 'drift' | 'blank';

const BG_KEY = 'cruxgarden:backgroundType';

function getBackgroundType(): BgType {
  const saved = getSetting(BG_KEY);
  if (saved === 'bloom' || saved === 'flowfield' || saved === 'drift' || saved === 'blank') return saved;
  const css =
    getComputedStyle(document.documentElement)
      .getPropertyValue('--background-type')
      .trim();
  if (css === 'flowfield' || css === 'drift' || css === 'blank') return css;
  return 'bloom';
}

function setBackgroundType(type: BgType) {
  setSetting(BG_KEY, type);
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
          : 'bg-surface border border-border text-text-muted hover:bg-accent-muted hover:text-accent hover:border-accent/30',
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

function BlankPreview() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
      <rect x="1" y="1" width="18" height="12" rx="2" fill="none" stroke="var(--accent)" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

// ── Palette Display ───────────────────────────────

interface PaletteBlock {
  label: string;
  description: string;
  tokens: { key: keyof MoodPalette; label: string }[];
}

const PALETTE_BLOCKS: PaletteBlock[] = [
  {
    label: 'Page',
    description: 'Canvas and root-level text',
    tokens: [
      { key: 'bg', label: 'bg' },
      { key: 'text', label: 'text' },
      { key: 'textMuted', label: 'text muted' },
      { key: 'border', label: 'border' },
    ],
  },
  {
    label: 'Surface',
    description: 'Cards and containers',
    tokens: [
      { key: 'surface', label: 'bg' },
      { key: 'surfaceSolid', label: 'bg solid' },
    ],
  },
  {
    label: 'Panel',
    description: 'Sidebars, modals, content areas',
    tokens: [
      { key: 'panel', label: 'bg' },
    ],
  },
  {
    label: 'Accent',
    description: 'Interactive elements, highlights',
    tokens: [
      { key: 'accent', label: 'color' },
      { key: 'accentMuted', label: 'muted' },
    ],
  },
  {
    label: 'Feedback',
    description: 'Error and status colors',
    tokens: [
      { key: 'error', label: 'error' },
      { key: 'errorMuted', label: 'error muted' },
    ],
  },
  {
    label: 'Toolbar Panes',
    description: 'Per-pane identity colors',
    tokens: [
      { key: 'paneCollaboration', label: 'Collaboration' },
      { key: 'paneArtifacts', label: 'Artifacts' },
      { key: 'paneWorkshop', label: 'Workshop' },
      { key: 'paneDetails', label: 'Metadata' },
      { key: 'paneHistory', label: 'History' },
      { key: 'paneExport', label: 'Export' },
      { key: 'paneSync', label: 'Sync' },
      { key: 'panePublish', label: 'Publish' },
    ],
  },
  {
    label: 'Code',
    description: 'Syntax highlighting',
    tokens: [
      { key: 'syntaxComment', label: 'comment' },
      { key: 'syntaxKeyword', label: 'keyword' },
      { key: 'syntaxString', label: 'string' },
      { key: 'syntaxNumber', label: 'number' },
      { key: 'syntaxType', label: 'type' },
      { key: 'syntaxFunction', label: 'function' },
      { key: 'syntaxPunctuation', label: 'punctuation' },
    ],
  },
  {
    label: 'Bloom',
    description: 'Background gradient blobs',
    tokens: [
      { key: 'bloom1', label: '1' },
      { key: 'bloom2', label: '2' },
      { key: 'bloom3', label: '3' },
      { key: 'bloom4', label: '4' },
      { key: 'bloom5', label: '5' },
      { key: 'bloom6', label: '6' },
      { key: 'bloomBg1', label: 'bg 1' },
      { key: 'bloomBg2', label: 'bg 2' },
    ],
  },
  {
    label: 'Ambient',
    description: 'Other background effects',
    tokens: [
      { key: 'flowColor', label: 'flow' },
      { key: 'driftColor', label: 'drift' },
      { key: 'driftGlow', label: 'drift glow' },
      { key: 'driftBg', label: 'drift bg' },
    ],
  },
  {
    label: 'Chrome',
    description: 'Overlays and brand',
    tokens: [
      { key: 'contrast', label: 'contrast' },
      { key: 'overlay', label: 'overlay' },
      { key: 'brandAi', label: 'AI brand' },
    ],
  },
];

function ColorSwatch({ value }: { value: string }) {
  return (
    <div
      className="w-5 h-5 rounded-[3px] border border-border/40 shrink-0"
      style={{ backgroundColor: value }}
      title={value}
    />
  );
}

function PaletteDisplay() {
  const [palette, setPalette] = useState<MoodPalette>(getCurrentMoodPalette);

  useEffect(() => {
    const handler = () => setPalette(getCurrentMoodPalette());
    document.addEventListener('palette-change', handler);
    return () => document.removeEventListener('palette-change', handler);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {PALETTE_BLOCKS.map((block) => (
        <div key={block.label}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs font-display font-medium text-text">{block.label}</span>
            <span className="text-[10px] text-text-muted">{block.description}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {block.tokens.map(({ key, label }) => {
              const value = palette[key];
              return (
                <div
                  key={key}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] bg-surface/50 border border-border/30"
                >
                  <ColorSwatch value={value} />
                  <span className="text-[10px] font-mono text-text-muted">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────

export default function MoodSettings() {
  const { mode, resolved, setMode } = useThemeStore();
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
        <h2 className="font-display text-sm font-medium text-settings-label">Mood</h2>
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
          <div className="flex items-center gap-2 flex-wrap">
            <OptionButton
              active={bgType === 'blank'}
              onClick={() => handleBgChange('blank')}
              icon={<BlankPreview />}
              label="Blank"
            />
            {resolved === 'dark' && (
              <>
                <OptionButton
                  active={bgType === 'drift'}
                  onClick={() => handleBgChange('drift')}
                  icon={<DriftPreview />}
                  label="Drift"
                />
                <OptionButton
                  active={bgType === 'flowfield'}
                  onClick={() => handleBgChange('flowfield')}
                  icon={<FlowFieldPreview />}
                  label="Flow"
                />
              </>
            )}
            <OptionButton
              active={bgType === 'bloom'}
              onClick={() => handleBgChange('bloom')}
              icon={<BloomPreview />}
              label="Bloom"
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
          <PaletteDisplay />
        </div>

        {/* ── Mood Library ── */}
        <MoodLibrary />
      </div>}
    </Panel>
  );
}

// ── Mood Library ──────────────────────────────────

function MoodLibrary() {
  const { moods, activeMoodId, setActiveMood, deleteMood, loaded } = useMoodStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleNew = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteMood(id);
  };

  const handleActivate = async (id: string) => {
    if (activeMoodId === id) {
      await setActiveMood(null);
    } else {
      await setActiveMood(id);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Moods</SectionLabel>
          <button
            onClick={handleNew}
            className="px-2.5 py-1 text-[10px] font-mono text-accent border border-accent/30 rounded-[var(--radius-sm)] hover:bg-accent-muted transition-colors cursor-pointer"
          >
            + New Mood
          </button>
        </div>

        {loaded && moods.length === 0 && (
          <p className="text-[10px] text-text-muted/60">
            No moods yet. Create one to customize your workspace.
          </p>
        )}

        {moods.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {moods.map((mood) => {
              const isActive = activeMoodId === mood.id;
              return (
                <div
                  key={mood.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] border transition-colors',
                    isActive
                      ? 'bg-accent-muted border-accent/30'
                      : 'bg-surface border-border/30',
                  )}
                >
                  <button
                    onClick={() => handleActivate(mood.id)}
                    className={cn(
                      'w-3 h-3 rounded-full border-2 shrink-0 cursor-pointer transition-colors',
                      isActive
                        ? 'border-accent bg-accent'
                        : 'border-text-muted/40 hover:border-accent/60',
                    )}
                    title={isActive ? 'Deactivate' : 'Activate'}
                  />
                  <span className="text-xs font-mono text-text flex-1 truncate">
                    {mood.title || 'Untitled'}
                  </span>
                  <button
                    onClick={() => handleEdit(mood.id)}
                    className="text-[10px] font-mono text-text-muted hover:text-accent transition-colors cursor-pointer"
                  >
                    edit
                  </button>
                  <button
                    onClick={() => handleDelete(mood.id)}
                    className="text-[10px] font-mono text-text-muted hover:text-error transition-colors cursor-pointer"
                  >
                    delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MoodEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        moodId={editingId}
      />
    </>
  );
}
