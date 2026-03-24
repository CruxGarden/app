import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCruxStore } from '@/stores/cruxStore';
import { DEFAULT_PANE_ORDER } from '@/stores/uiStore';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { getApiKey } from '@/ai/keys';
import { importCrux } from '@/services/crux-io';
import { useGardenStore } from '@/stores/gardenStore';
import { Modal, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { loadTemplate } from '@/templates';
import type { CruxKind } from '@/api/types';

// ── Icons ────────────────────────────────────────────────

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function BlogIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function UtensilsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function PortfolioIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="18" x2="12" y2="18" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 8c2 3 4 1 6 4s3 0 5 2" />
      <circle cx="8" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function GamepadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="18" y1="11" x2="18.01" y2="11" />
      <rect x="2" y="6" width="20" height="12" rx="2" />
    </svg>
  );
}

function SlidesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
      <path d="M7 8h4" />
      <path d="M7 12h10" />
    </svg>
  );
}

function TutorialIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function ZineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ProductIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function SocialIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

function PushpinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function CrystalBallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="8" />
      <path d="M8 20h8" />
      <path d="M9 18h6" />
      <path d="M9 6a4 4 0 0 0-.9 2" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function FloppyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function RockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l4-8 4 3 5-7 5 12z" />
      <path d="M3 17h18" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

// ── Templates ────────────────────────────────────────────

interface Template {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** CSS-only mini wireframe preview */
  thumb: React.ReactNode;
  kind: CruxKind;
  defaultTitle: string;
}

// ── Thumbnails ──────────────────────────────────────────
// Tiny CSS wireframe previews (~80×52px) for each template.
// Uses inline styles to stay self-contained — no external CSS needed.

const T = {
  wrap: { width: '100%', height: 52, borderRadius: 4, overflow: 'hidden' as const, position: 'relative' as const, fontSize: 0 },
  bar: (w: string | number, h = 3, bg = '#555') => ({ width: w, height: h, borderRadius: 1, background: bg }),
  line: (w: string | number, h = 2, bg = '#444') => ({ width: w, height: h, borderRadius: 1, background: bg }),
  box: (w: string | number, h: string | number, bg = '#333') => ({ width: w, height: h, borderRadius: 2, background: bg }),
  flex: (gap = 3, dir: 'row' | 'column' = 'row') => ({ display: 'flex' as const, gap, flexDirection: dir }),
  col: (gap = 2) => ({ display: 'flex' as const, flexDirection: 'column' as const, gap }),
  pad: (p = 6) => ({ padding: p }),
  center: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
} as const;

function BlankThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.center }}>
      <div style={{ ...T.col(3), alignItems: 'center' }}>
        <div style={T.bar(16, 16, '#252525')} />
        <div style={T.line(24, 2, '#252525')} />
      </div>
    </div>
  );
}

function BlogThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1c1c1c', ...T.pad(6) }}>
      <div style={T.col(3)}>
        <div style={T.bar('40%', 3)} />
        <div style={T.line('90%')} />
        <div style={T.line('80%')} />
        <div style={T.line('70%')} />
        <div style={{ marginTop: 3, ...T.col(2) }}>
          <div style={T.bar('35%', 2)} />
          <div style={T.line('85%')} />
          <div style={T.line('60%')} />
        </div>
      </div>
    </div>
  );
}

function StoryThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1e1c19', ...T.pad(8), ...T.col(3), alignItems: 'center' }}>
      <div style={T.bar('50%', 3, '#665')} />
      <div style={{ ...T.col(2), width: '100%' }}>
        <div style={T.line('100%', 2, '#3a3a30')} />
        <div style={T.line('95%', 2, '#3a3a30')} />
        <div style={T.line('100%', 2, '#3a3a30')} />
        <div style={T.line('80%', 2, '#3a3a30')} />
        <div style={{ height: 3 }} />
        <div style={T.line('100%', 2, '#3a3a30')} />
        <div style={T.line('90%', 2, '#3a3a30')} />
      </div>
    </div>
  );
}

function ZineThumb() {
  return (
    <div style={{ ...T.wrap, background: '#111', ...T.pad(5) }}>
      <div style={{ ...T.flex(4), height: '100%' }}>
        <div style={{ flex: 1, ...T.col(2) }}>
          <div style={T.bar('80%', 4, '#e0e0e0')} />
          <div style={T.line('60%', 2, '#555')} />
          <div style={T.line('90%', 1, '#333')} />
          <div style={T.line('70%', 1, '#333')} />
        </div>
        <div style={T.box(24, '100%', '#2a2a2a')} />
      </div>
    </div>
  );
}

function AlbumThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.pad(4) }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, height: '100%' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ background: `hsl(${i * 40 + 200}, 20%, ${18 + i * 2}%)`, borderRadius: 1 }} />
        ))}
      </div>
    </div>
  );
}

function VideoThumb() {
  return (
    <div style={{ ...T.wrap, background: '#0a0a0f', ...T.center }}>
      <div style={{ width: '80%', height: 32, background: '#151520', borderRadius: 3, ...T.center, position: 'relative' }}>
        <div style={{ width: 0, height: 0, borderLeft: '8px solid #555', borderTop: '5px solid transparent', borderBottom: '5px solid transparent' }} />
        <div style={{ position: 'absolute', bottom: 2, left: 4, right: 4, height: 2, background: '#222', borderRadius: 1 }}>
          <div style={{ width: '30%', height: '100%', background: '#60a5fa', borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

function PortfolioThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.pad(4) }}>
      <div style={T.col(3)}>
        <div style={{ ...T.center }}><div style={T.bar('50%', 2)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          <div style={T.box('100%', 14, '#252525')} />
          <div style={T.box('100%', 14, '#252525')} />
        </div>
      </div>
    </div>
  );
}

function JournalThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.pad(5) }}>
      <div style={{ ...T.col(4), paddingLeft: 10, borderLeft: '2px solid #333', position: 'relative' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...T.flex(4), alignItems: 'center' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', position: 'absolute', left: -2, marginLeft: -1.5 }} />
            <div style={T.col(1)}>
              <div style={T.bar(20, 2, '#555')} />
              <div style={T.line(30 + i * 5, 1)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomepageThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.col(0) }}>
      <div style={{ height: 24, background: '#222', ...T.center, ...T.col(2) }}>
        <div style={T.bar(30, 3)} />
        <div style={T.line(20, 1, '#444')} />
      </div>
      <div style={{ ...T.pad(4), ...T.flex(3), justifyContent: 'center' }}>
        {[0, 1, 2].map((i) => <div key={i} style={T.box(16, 12, '#282828')} />)}
      </div>
    </div>
  );
}

function BusinessThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.col(0) }}>
      <div style={{ height: 6, background: '#222', ...T.flex(0), alignItems: 'center', padding: '0 4px', justifyContent: 'space-between' }}>
        <div style={T.bar(12, 2)} />
        <div style={{ ...T.flex(2) }}>{[0, 1, 2].map((i) => <div key={i} style={T.line(6, 1, '#444')} />)}</div>
      </div>
      <div style={{ height: 22, background: '#222', ...T.center, ...T.col(2) }}>
        <div style={T.bar(30, 3)} />
        <div style={T.box(20, 4, '#3b82f6')} />
      </div>
      <div style={{ ...T.pad(3), ...T.flex(2), justifyContent: 'center' }}>
        {[0, 1, 2].map((i) => <div key={i} style={T.box(18, 10, '#252525')} />)}
      </div>
    </div>
  );
}

function ResumeThumb() {
  return (
    <div style={{ ...T.wrap, background: '#222', ...T.center }}>
      <div style={{ width: '80%', height: 44, background: '#fafafa', borderRadius: 2, ...T.pad(4), ...T.col(2) }}>
        <div style={T.bar('50%', 3, '#333')} />
        <div style={T.line('30%', 1, '#bbb')} />
        <div style={{ height: 1 }} />
        <div style={T.bar('25%', 2, '#999')} />
        <div style={T.line('90%', 1, '#ddd')} />
        <div style={T.line('80%', 1, '#ddd')} />
        <div style={{ height: 1 }} />
        <div style={T.bar('25%', 2, '#999')} />
        <div style={T.line('85%', 1, '#ddd')} />
      </div>
    </div>
  );
}

function LinksThumb() {
  return (
    <div style={{ ...T.wrap, background: 'linear-gradient(135deg, #1a1a2e, #16213e)', ...T.center }}>
      <div style={{ ...T.col(3), alignItems: 'center' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#333' }} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.08)' }} />
        ))}
      </div>
    </div>
  );
}

function SocialThumb() {
  return (
    <div style={{ ...T.wrap, background: '#fafafa', ...T.col(0) }}>
      <div style={{ ...T.flex(3), alignItems: 'center', padding: '2px 4px' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(135deg, #f09433, #dc2743)' }} />
        <div style={T.bar(16, 2, '#333')} />
      </div>
      <div style={{ flex: 1, background: '#e8e8e8' }} />
      <div style={{ padding: '2px 4px', ...T.col(1) }}>
        <div style={T.line(24, 1, '#ccc')} />
        <div style={T.line(32, 1, '#ddd')} />
      </div>
    </div>
  );
}

function EventThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.col(0) }}>
      <div style={{ height: 24, background: 'linear-gradient(135deg, #2a1a0a, #1a150a)', ...T.center, ...T.col(2) }}>
        <div style={T.bar(30, 3, '#d4a') } />
        <div style={T.line(20, 1, '#665')} />
      </div>
      <div style={{ ...T.pad(4), ...T.flex(3) }}>
        <div style={T.box(18, 14, '#252525')} />
        <div style={{ ...T.col(2), flex: 1 }}>
          <div style={T.line('90%', 1, '#444')} />
          <div style={T.line('60%', 1, '#333')} />
        </div>
      </div>
    </div>
  );
}

function TributeThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1e1c19', ...T.center }}>
      <div style={{ ...T.col(3), alignItems: 'center' }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#2a2722', border: '1px solid #3a3630' }} />
        <div style={T.bar(28, 2, '#555')} />
        <div style={T.line(18, 1, '#3a3a30')} />
      </div>
    </div>
  );
}

function ClassifiedThumb() {
  return (
    <div style={{ ...T.wrap, background: '#f5f5f5', ...T.col(0) }}>
      <div style={{ height: 22, background: '#e0e0e0' }} />
      <div style={{ ...T.pad(4), ...T.col(2) }}>
        <div style={T.bar('60%', 2, '#333')} />
        <div style={T.bar('30%', 3, '#16a34a')} />
        <div style={T.line('80%', 1, '#ccc')} />
      </div>
    </div>
  );
}

function ProductThumb() {
  return (
    <div style={{ ...T.wrap, background: '#fafafa', ...T.pad(4) }}>
      <div style={{ ...T.flex(4), height: '100%', alignItems: 'center' }}>
        <div style={{ ...T.col(2), flex: 1 }}>
          <div style={T.bar('80%', 3, '#222')} />
          <div style={T.line('60%', 1, '#999')} />
          <div style={T.box(22, 5, '#111')} />
        </div>
        <div style={T.box(22, 28, '#e8e8e8')} />
      </div>
    </div>
  );
}

function RecipesThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1c1a18', ...T.pad(4) }}>
      <div style={T.col(3)}>
        <div style={{ ...T.center }}><div style={T.bar(28, 2)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: '#252320', borderRadius: 2, ...T.col(0) }}>
              <div style={{ height: 12, background: '#2a2825', borderRadius: '2px 2px 0 0' }} />
              <div style={{ ...T.pad(2) }}><div style={T.line('70%', 1, '#555')} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1e1c19', ...T.pad(5) }}>
      <div style={T.col(3)}>
        <div style={{ ...T.center }}><div style={T.bar(24, 2, '#665')} /></div>
        <div style={T.bar('30%', 1, '#b8860b')} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...T.flex(0), justifyContent: 'space-between' }}>
            <div style={T.line(28 + i * 3, 1, '#444')} />
            <div style={T.line(10, 1, '#555')} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorialThumb() {
  return (
    <div style={{ ...T.wrap, background: '#f8f9fa', ...T.pad(5) }}>
      <div style={T.col(3)}>
        <div style={T.bar('50%', 3, '#222')} />
        {[1, 2].map((n) => (
          <div key={n} style={{ ...T.flex(3), alignItems: 'flex-start' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', ...T.center, fontSize: 5, color: '#fff', fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>{n}</div>
            <div style={T.col(1)}>
              <div style={T.bar(24, 2, '#333')} />
              <div style={T.line(36, 1, '#ddd')} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlidesThumb() {
  return (
    <div style={{ ...T.wrap, background: '#0f0f0f', ...T.center }}>
      <div style={{ width: '75%', height: 36, background: '#1a1a1a', borderRadius: 2, ...T.center, ...T.col(3) }}>
        <div style={T.bar(30, 3, '#eee')} />
        <div style={T.line(20, 1, '#555')} />
      </div>
    </div>
  );
}

function GameThumb() {
  return (
    <div style={{ ...T.wrap, background: '#111', ...T.center }}>
      <div style={{ width: 36, height: 36, background: '#1a1a2e', borderRadius: 2, position: 'relative' }}>
        {/* Grid lines */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, backgroundImage: 'repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 6px), repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 6px)' }} />
        {/* Player */}
        <div style={{ position: 'absolute', left: 15, top: 15, width: 5, height: 5, background: '#60a5fa', borderRadius: 1 }} />
        {/* Coin */}
        <div style={{ position: 'absolute', left: 27, top: 9, width: 4, height: 4, borderRadius: '50%', background: '#fbbf24' }} />
      </div>
    </div>
  );
}

function BoardThumb() {
  return (
    <div style={{ ...T.wrap, background: '#111', ...T.center }}>
      <div style={{ width: 40, height: 28, background: '#1a1a1a', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        {/* Strokes */}
        <svg width="40" height="28" viewBox="0 0 40 28" style={{ position: 'absolute', inset: 0 }}>
          <path d="M8 20 C12 10, 18 8, 22 14 S30 22, 35 16" stroke="#4ade80" strokeWidth="1.5" fill="none" opacity="0.7" />
          <path d="M5 12 C10 18, 16 6, 24 10" stroke="#60a5fa" strokeWidth="1.5" fill="none" opacity="0.5" />
          <circle cx="30" cy="8" r="1.5" fill="#fbbf24" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

function VaultThumb() {
  return (
    <div style={{ ...T.wrap, background: '#111', ...T.pad(4) }}>
      <div style={{ display: 'flex', gap: 3, height: '100%' }}>
        {/* Sidebar */}
        <div style={{ width: '30%', ...T.col(2), background: '#161616', borderRadius: 2, padding: 3 }}>
          <div style={T.line('80%', 1.5, '#333')} />
          <div style={{ marginLeft: 4, ...T.col(1.5) }}>
            <div style={T.line('70%', 1, '#2a2a2a')} />
            <div style={T.line('60%', 1, '#2a2a2a')} />
          </div>
          <div style={T.line('80%', 1.5, '#333')} />
          <div style={{ marginLeft: 4, ...T.col(1.5) }}>
            <div style={T.line('50%', 1, '#2a2a2a')} />
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, ...T.col(3), padding: 3 }}>
          <div style={T.bar('60%', 3, '#7db3a3')} />
          <div style={T.line('90%', 1.5, '#2a2a2a')} />
          <div style={T.line('80%', 1.5, '#2a2a2a')} />
          <div style={T.line('85%', 1.5, '#2a2a2a')} />
          <div style={{ height: 2 }} />
          <div style={T.bar('45%', 2, '#555')} />
          <div style={T.line('70%', 1.5, '#2a2a2a')} />
        </div>
      </div>
    </div>
  );
}

function RansomThumb() {
  return (
    <div style={{ ...T.wrap, background: '#e8d5a3', ...T.pad(6) }}>
      <div style={{ ...T.flex(2), flexWrap: 'wrap' as const, justifyContent: 'center' }}>
        {['W','E','H','A','V','E'].map((_, i) => (
          <div key={i} style={{
            width: 7, height: 9, borderRadius: 1,
            background: ['#c33','#333','#369','#c33','#555','#963'][i],
            transform: `rotate(${(i % 3 - 1) * 8}deg)`,
          }} />
        ))}
      </div>
      <div style={{ ...T.flex(1), flexWrap: 'wrap' as const, justifyContent: 'center', marginTop: 4 }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{
            width: 5, height: 6, borderRadius: 1,
            background: ['#444','#933','#363','#555','#939','#333','#693','#444'][i],
            transform: `rotate(${(i % 5 - 2) * 6}deg)`,
          }} />
        ))}
      </div>
    </div>
  );
}

function ConspiracyThumb() {
  return (
    <div style={{ ...T.wrap, background: '#8B6914', ...T.pad(4), position: 'relative' }}>
      {/* String */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
        <line x1="18" y1="12" x2="52" y2="10" stroke="#cc2222" strokeWidth="1" opacity="0.5" />
        <line x1="52" y1="10" x2="35" y2="35" stroke="#cc2222" strokeWidth="1" opacity="0.5" />
      </svg>
      <div style={{ ...T.flex(6), justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ width: 18, height: 16, background: '#fef3a0', transform: 'rotate(-3deg)', borderRadius: 1, position: 'relative' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d33', position: 'absolute', top: -3, left: 6 }} />
        </div>
        <div style={{ width: 18, height: 16, background: '#f5f5f5', transform: 'rotate(2deg)', borderRadius: 1, position: 'relative' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d33', position: 'absolute', top: -3, left: 6 }} />
        </div>
      </div>
      <div style={{ ...T.center, marginTop: 4, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 18, height: 16, background: '#ffcccc', transform: 'rotate(1deg)', borderRadius: 1, position: 'relative' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d33', position: 'absolute', top: -3, left: 6 }} />
        </div>
      </div>
    </div>
  );
}

function FortuneThumb() {
  return (
    <div style={{ ...T.wrap, background: '#0a0012', ...T.center }}>
      <div style={{ ...T.col(3), alignItems: 'center' }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, rgba(200,180,255,0.2), rgba(80,40,120,0.5))',
          border: '1px solid rgba(180,140,255,0.3)',
          boxShadow: '0 0 8px rgba(179,136,255,0.3)',
        }} />
        <div style={T.line(20, 1, '#b388ff')} />
        <div style={T.line(28, 1, '#4a2060')} />
      </div>
    </div>
  );
}

function WantedThumb() {
  return (
    <div style={{ ...T.wrap, background: '#3a2a1a', ...T.center }}>
      <div style={{ width: '80%', height: 44, background: '#e8d5a3', borderRadius: 1, ...T.pad(4), ...T.col(2), alignItems: 'center' }}>
        <div style={T.bar('70%', 4, '#2a1a0a')} />
        <div style={T.line('40%', 1, '#8b0000')} />
        <div style={T.box(16, 12, '#c8b07a')} />
        <div style={T.bar('50%', 2, '#2a1a0a')} />
      </div>
    </div>
  );
}

function GeocitiesThumb() {
  return (
    <div style={{ ...T.wrap, background: '#000080', ...T.col(0) }}>
      <div style={{ height: 6, background: '#ff0', ...T.center }}>
        <div style={T.bar(30, 2, '#f00')} />
      </div>
      <div style={{ ...T.pad(3), ...T.col(2), alignItems: 'center' }}>
        <div style={{ ...T.bar('60%', 3, '#ff00ff') }} />
        <div style={{ width: '80%', height: 4, background: '#000', overflow: 'hidden', border: '1px inset #808080' }}>
          <div style={T.line('50%', 2, '#0f0')} />
        </div>
        <div style={{ background: 'linear-gradient(90deg, red, orange, yellow, green, blue, violet)', width: '100%', height: 2 }} />
      </div>
      <div style={{ ...T.pad(3), ...T.flex(2) }}>
        <div style={{ width: 16, background: 'rgba(0,0,0,0.3)', ...T.col(1), ...T.pad(2) }}>
          {[0, 1, 2].map(i => <div key={i} style={T.line(10, 1, '#0f0')} />)}
        </div>
        <div style={{ flex: 1, ...T.col(1) }}>
          <div style={T.line('80%', 1, '#ff0')} />
          <div style={T.line('60%', 1, '#ff0')} />
        </div>
      </div>
    </div>
  );
}

function PetRockThumb() {
  return (
    <div style={{ ...T.wrap, background: '#f5f0eb', ...T.center }}>
      <div style={{ ...T.col(3), alignItems: 'center' }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: '#e8e0d8', border: '2px solid #8B7355',
        }} />
        <div style={T.bar(24, 2, '#8B7355')} />
        <div style={{ ...T.flex(2) }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 12, height: 3, borderRadius: 1, background: '#e8e0d8' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const TEMPLATES: Template[] = [
  // ── Start here ──
  { id: 'blank', label: 'Blank', description: 'Empty workspace', icon: <LayoutIcon />, thumb: <BlankThumb />, kind: 'webapp', defaultTitle: '' },
  // ── Creative / Personal ──
  { id: 'blog', label: 'Blog', description: 'Write and publish posts', icon: <BlogIcon />, thumb: <BlogThumb />, kind: 'page', defaultTitle: 'My Blog' },
  { id: 'story', label: 'Story', description: 'Write fiction or narrative', icon: <BookIcon />, thumb: <StoryThumb />, kind: 'document', defaultTitle: 'Untitled Story' },
  { id: 'zine', label: 'Zine', description: 'Digital magazine or newsletter', icon: <ZineIcon />, thumb: <ZineThumb />, kind: 'webapp', defaultTitle: 'My Zine' },
  { id: 'album', label: 'Photo Album', description: 'Organize and share photos', icon: <PhotoIcon />, thumb: <AlbumThumb />, kind: 'webapp', defaultTitle: 'Photo Album' },
  { id: 'video', label: 'Video', description: 'Video player with chapters', icon: <VideoIcon />, thumb: <VideoThumb />, kind: 'webapp', defaultTitle: 'My Video' },
  { id: 'portfolio', label: 'Portfolio', description: 'Showcase your work', icon: <PortfolioIcon />, thumb: <PortfolioThumb />, kind: 'webapp', defaultTitle: 'My Portfolio' },
  { id: 'journal', label: 'Travel Journal', description: 'Document trips and adventures', icon: <CompassIcon />, thumb: <JournalThumb />, kind: 'webapp', defaultTitle: 'Travel Journal' },
  // ── Sites & Pages ──
  { id: 'homepage', label: 'Home Page', description: 'Personal or project site', icon: <HomeIcon />, thumb: <HomepageThumb />, kind: 'webapp', defaultTitle: 'My Site' },
  { id: 'business', label: 'Business', description: 'Company or service page', icon: <BriefcaseIcon />, thumb: <BusinessThumb />, kind: 'webapp', defaultTitle: 'My Business' },
  { id: 'resume', label: 'Resume', description: 'Online CV and skills', icon: <ResumeIcon />, thumb: <ResumeThumb />, kind: 'page', defaultTitle: 'My Resume' },
  { id: 'links', label: 'Link Page', description: 'Collection of links and profiles', icon: <LinkIcon />, thumb: <LinksThumb />, kind: 'page', defaultTitle: 'My Links' },
  // ── Social / Events ──
  { id: 'social', label: 'Social Post', description: 'Instagram-style photo post', icon: <SocialIcon />, thumb: <SocialThumb />, kind: 'page', defaultTitle: 'My Post' },
  { id: 'event', label: 'Event', description: 'Party, wedding, or meetup', icon: <CalendarIcon />, thumb: <EventThumb />, kind: 'webapp', defaultTitle: 'My Event' },
  { id: 'tribute', label: 'Tribute', description: 'Honor or remember someone', icon: <HeartIcon />, thumb: <TributeThumb />, kind: 'page', defaultTitle: 'A Tribute' },
  { id: 'classified', label: 'Classified Ad', description: 'Sell or promote something', icon: <MegaphoneIcon />, thumb: <ClassifiedThumb />, kind: 'page', defaultTitle: 'For Sale' },
  { id: 'product', label: 'Product Page', description: 'Showcase and sell a product', icon: <ProductIcon />, thumb: <ProductThumb />, kind: 'webapp', defaultTitle: 'My Product' },
  // ── Practical ──
  { id: 'recipes', label: 'Recipe Book', description: 'Collect and share recipes', icon: <UtensilsIcon />, thumb: <RecipesThumb />, kind: 'webapp', defaultTitle: 'Recipe Book' },
  { id: 'menu', label: 'Menu', description: 'Restaurant or cafe menu', icon: <MenuIcon />, thumb: <MenuThumb />, kind: 'page', defaultTitle: 'Our Menu' },
  // ── Interactive / Technical ──
  { id: 'tutorial', label: 'Tutorial', description: 'Step-by-step how-to guide', icon: <TutorialIcon />, thumb: <TutorialThumb />, kind: 'webapp', defaultTitle: 'How To' },
  { id: 'slides', label: 'Slide Deck', description: 'Web-based presentation', icon: <SlidesIcon />, thumb: <SlidesThumb />, kind: 'webapp', defaultTitle: 'My Presentation' },
  { id: 'game', label: 'Game', description: 'Interactive web game', icon: <GamepadIcon />, thumb: <GameThumb />, kind: 'webapp', defaultTitle: 'My Game' },
  { id: 'vault', label: 'Vault', description: 'Markdown notes as a website', icon: <VaultIcon />, thumb: <VaultThumb />, kind: 'notes', defaultTitle: 'My Vault' },
  { id: 'board', label: 'The Board', description: 'Collaborative canvas with Crux Store', icon: <BoardIcon />, thumb: <BoardThumb />, kind: 'webapp', defaultTitle: 'Tutorial - The Board' },
  // ── Silly / Fun / Weird ──
  { id: 'ransom', label: 'Ransom Note', description: 'Cut-out magazine letter message', icon: <ScissorsIcon />, thumb: <RansomThumb />, kind: 'page', defaultTitle: 'A Message' },
  { id: 'conspiracy', label: 'Conspiracy', description: 'Corkboard with red strings', icon: <PushpinIcon />, thumb: <ConspiracyThumb />, kind: 'webapp', defaultTitle: 'The Board' },
  { id: 'fortune', label: 'Fortune Teller', description: 'Mystical predictions page', icon: <CrystalBallIcon />, thumb: <FortuneThumb />, kind: 'webapp', defaultTitle: 'Your Fortune' },
  { id: 'wanted', label: 'Wanted Poster', description: 'Old West bounty poster', icon: <TargetIcon />, thumb: <WantedThumb />, kind: 'page', defaultTitle: 'WANTED' },
  { id: 'geocities', label: 'Geocities', description: '90s web nostalgia homepage', icon: <FloppyIcon />, thumb: <GeocitiesThumb />, kind: 'webapp', defaultTitle: 'My Homepage!!!' },
  { id: 'petrock', label: 'Pet Rock', description: 'Profile page for your rock', icon: <RockIcon />, thumb: <PetRockThumb />, kind: 'page', defaultTitle: 'Meet My Rock' },
];

// ── Component ────────────────────────────────────────────

interface NewCruxModalProps {
  open: boolean;
  onClose: () => void;
}

export default function NewCruxModal({ open, onClose }: NewCruxModalProps) {
  const navigate = useNavigate();
  const createCrux = useCruxStore((s) => s.createCrux);
  const refresh = useGardenStore((s) => s.load);

  const [title, setTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  const [creating, setCreating] = useState(false);

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });


  const template = (TEMPLATES.find((t) => t.id === selectedTemplate) ?? TEMPLATES[0])!;

  const reset = () => {
    setTitle('');
    setSelectedTemplate('blank');
    setCreating(false);
  };

  const handleImport = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportProgress({ done: 0, total: 0 });

      try {
        const result = await importCrux({
          data: file,
          mode: 'clone',
          onProgress: (done, total) => setImportProgress({ done, total }),
        });

        if (result.layout) {
          const layout = result.layout;
          if (layout.paneOrder && layout.paneVisibility) {
            setSetting(
              `cruxgarden:layout:${result.cruxId}`,
              JSON.stringify({ paneOrder: layout.paneOrder, paneVisibility: layout.paneVisibility }),
            );
          }
          if (layout.editorTabs) {
            setSetting(`cruxgarden:editor-tabs:${result.cruxId}`, JSON.stringify(layout.editorTabs));
          }
          if (layout.folderState) {
            setSetting(`cruxgarden:folder-state:${result.cruxId}`, JSON.stringify(layout.folderState));
          }
        }

        if (result.theme) {
          if (result.theme.mode) setSetting(SettingsKey.Theme, result.theme.mode);
          if (result.theme.tint) setSetting(SettingsKey.Tint, result.theme.tint);
        }

        if (result.failedArtifacts.length > 0) {
          console.warn('Some artifacts failed to import:', result.failedArtifacts);
          alert(`Import completed with ${result.failedArtifacts.length} file${result.failedArtifacts.length > 1 ? 's' : ''} that could not be restored.`);
        }

        refresh();
        reset();
        onClose();
        navigate(`/c/${result.cruxId}`);
      } catch (err) {
        console.error('Import failed:', err);
        alert(`Failed to import .crux file: ${err instanceof Error ? err.message : 'Make sure it is a valid export.'}`);
      } finally {
        setImporting(false);
        setImportProgress({ done: 0, total: 0 });
      }
    },
    [navigate, refresh, onClose],
  );

  const handleImportInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleImport(file);
      e.target.value = '';
    },
    [handleImport],
  );

  const handleCreate = async (quickStart = false) => {
    setCreating(true);
    try {
      const effectiveTitle = quickStart
        ? undefined
        : title.trim() || template.defaultTitle || undefined;

      const crux = await createCrux(effectiveTitle);

      // Load template files and set kind/context/greeting if not quick-start blank
      let templateDef: Awaited<ReturnType<typeof loadTemplate>> = null;
      if (!quickStart && template.id !== 'blank') {
        const { getServices } = await import('@/services');
        const services = getServices();

        const updates: Record<string, unknown> = { kind: template.kind };

        // Load template definition and create artifact files
        templateDef = await loadTemplate(template.id);
        if (templateDef) {
          // Create each template file as an artifact
          for (const file of templateDef.files) {
            await services.artifact.create({
              resourceId: crux.id,
              content: file.content,
              meta: { path: file.path },
            });
          }

          // Replace greeting with template-specific intro and append context to system prompt
          if (crux.meta?.settings?.systemPrompt) {
            const messages = templateDef.greeting
              ? [{ role: 'assistant' as const, content: templateDef.greeting }]
              : crux.meta.messages ?? [];

            updates.meta = {
              ...crux.meta,
              messages,
              settings: {
                ...crux.meta.settings,
                systemPrompt: templateDef.context
                  ? crux.meta.settings.systemPrompt + '\n\nCONTEXT: ' + templateDef.context
                  : crux.meta.settings.systemPrompt,
              },
              // Store form schema for data-driven templates
              ...(templateDef.schema ? { formSchema: templateDef.schema } : {}),
            };

            // Update store messages so UI reflects the greeting immediately
            if (templateDef.greeting) {
              useCruxStore.setState({ messages });
            }
          }
        }

        await services.crux.update(crux.id, updates);
      }

      // Set initial pane layout based on template preset (or fallback for blank)
      const hasApiKey = !!(await getApiKey('anthropic'));
      const visibility: Record<string, boolean> = {};
      for (const pane of DEFAULT_PANE_ORDER) visibility[pane] = false;

      const templateLayout = (!quickStart && template.id !== 'blank') ? templateDef?.layout : null;

      if (templateLayout) {
        // Template with a layout preset — use its pane set and mosaic tree
        for (const pane of templateLayout.panes) visibility[pane] = true;
        setSetting(
          `cruxgarden:layout:${crux.id}`,
          JSON.stringify({
            paneOrder: DEFAULT_PANE_ORDER,
            paneVisibility: visibility,
            mosaicLayout: templateLayout.mosaic,
          }),
        );
      } else {
        // Blank workspace fallback
        if (hasApiKey) {
          visibility.collaboration = true;
          visibility.details = true;
        } else {
          visibility.collaboration = true;
          visibility.artifacts = true;
          visibility.workshop = true;
        }
        setSetting(
          `cruxgarden:layout:${crux.id}`,
          JSON.stringify({ paneOrder: DEFAULT_PANE_ORDER, paneVisibility: visibility }),
        );
      }

      reset();
      onClose();
      navigate(`/c/${crux.id}`);
    } catch {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating || importing) return;
    reset();
    onClose();
  };

  const inputClass = cn(
    'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-sm)]',
    'bg-surface-solid border border-border text-text placeholder:text-text-muted/50',
    'focus:outline-none focus:border-accent transition-colors',
    'disabled:opacity-50',
  );

  return (
    <Modal open={open} onClose={handleClose} className="max-w-xl">
      <div className="space-y-5">
        {/* Header with quick start */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-text">New Crux</h2>
            <p className="text-xs text-text-muted mt-0.5">Choose a starting point</p>
          </div>
          <button
            onClick={() => handleCreate(true)}
            disabled={creating}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
              'text-text-muted hover:text-accent hover:bg-accent-muted border border-border',
              'transition-colors cursor-pointer',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <ZapIcon />
            Quick start
          </button>
        </div>

        {/* Template selector */}
        <div>
          <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
            Template
          </label>
          <div className="grid grid-cols-4 gap-2 max-h-[280px] overflow-y-auto pr-0.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTemplate(t.id);
                  // Pre-fill title from template if name field is empty
                  if (!title.trim() && t.defaultTitle) {
                    setTitle(t.defaultTitle);
                  }
                }}
                disabled={creating}
                className={cn(
                  'flex flex-col rounded-[var(--radius-sm)] overflow-hidden',
                  'border transition-all cursor-pointer text-center',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  selectedTemplate === t.id
                    ? 'border-accent ring-1 ring-accent/30'
                    : 'border-border hover:border-text-muted/40',
                )}
              >
                <div className="w-full">{t.thumb}</div>
                <span className={cn(
                  'text-[10px] font-mono leading-tight py-1.5 w-full transition-colors',
                  selectedTemplate === t.id ? 'text-accent bg-accent-muted' : 'text-text-muted',
                )}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
          {template.id !== 'blank' && (
            <p className="text-[11px] text-text-muted mt-1.5">{template.description}</p>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
            Name
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={template.defaultTitle || 'My new creation'}
            disabled={creating}
            className={inputClass}
            autoFocus
          />
        </div>

        {/* Import */}
        <div className="border-t border-border pt-4">
          <input
            ref={importInputRef}
            type="file"
            accept=".crux,.zip"
            className="hidden"
            onChange={handleImportInput}
          />
          {importing ? (
            <div className="flex items-center gap-3">
              <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
                <svg width="24" height="24" viewBox="0 0 28 28" className="-rotate-90">
                  <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
                  <circle
                    cx="14" cy="14" r="12"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    className="text-accent transition-[stroke-dashoffset] duration-300"
                    strokeDasharray={2 * Math.PI * 12}
                    strokeDashoffset={importProgress.total > 0 ? 2 * Math.PI * 12 * (1 - importProgress.done / importProgress.total) : 2 * Math.PI * 12}
                  />
                </svg>
                <span className="absolute text-[8px] font-mono text-text-muted">
                  {importProgress.total > 0 ? Math.round((importProgress.done / importProgress.total) * 100) : 0}
                </span>
              </div>
              <span className="text-xs font-mono text-text-muted">Importing...</span>
            </div>
          ) : (
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={creating}
              className={cn(
                'flex items-center gap-2 text-xs font-mono text-text-muted',
                'hover:text-accent transition-colors cursor-pointer',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <ImportIcon />
              Import .crux file
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={handleClose} disabled={creating || importing}>
            Cancel
          </Button>
          <Button onClick={() => handleCreate()} loading={creating} disabled={importing}>
            Create
          </Button>
        </div>
      </div>

    </Modal>
  );
}
