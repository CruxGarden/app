import { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useMoodStore } from '@/stores/moodStore';
import { getSetting, setSetting } from '@/services/settings';
import { BG_CSS_VAR, SettingsKey } from '@/lib/constants';
import { BgType, ThemeMode } from '@/lib/types';
import BloomBackground from './BloomBackground';
import FlowBackground from './FlowBackground';
import DriftBackground from './DriftBackground';

function getDefault(): BgType {
  setSetting(SettingsKey.BackgroundType, BgType.Bloom);
  document.documentElement.style.setProperty(BG_CSS_VAR, BgType.Bloom);
  return BgType.Bloom;
}

export default function AnimatedBackground() {
  const activeMode = useThemeStore((s) => s.activeMode);
  const backgroundUrl = useMoodStore((s) => s.backgroundUrl);

  const [bgType, setBgType] = useState<BgType>(() => {
    const saved = getSetting(SettingsKey.BackgroundType) as BgType | null;
    if (saved) {
      document.documentElement.style.setProperty(BG_CSS_VAR, saved);
      return saved;
    }
    return getDefault();
  });
  const selectedType = useRef(bgType);

  // Watch for external changes to --background-type (e.g. mood system)
  useEffect(() => {
    const root = document.documentElement;
    let previousInline = root.style.getPropertyValue(BG_CSS_VAR);
    let previousClass = root.className;
    const observer = new MutationObserver(() => {
      const inline = root.style.getPropertyValue(BG_CSS_VAR);
      const classes = root.className;
      // Flow/audio animate other root properties every frame. Avoid a computed
      // style read and a same-value React update for each of those mutations.
      if (inline === previousInline && classes === previousClass) return;
      previousInline = inline;
      previousClass = classes;
      const val = (getComputedStyle(root).getPropertyValue(BG_CSS_VAR).trim() ||
        getSetting(SettingsKey.BackgroundType) ||
        BgType.Bloom) as BgType;
      if (selectedType.current !== val) {
        selectedType.current = val;
        setBgType(val);
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => observer.disconnect();
  }, []);

  // Image overlays a background image
  if (bgType === BgType.Image && backgroundUrl) {
    return (
      <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div
          data-testid="mood-background-image"
          className="mood-bg-image absolute inset-0"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        />
        <div className="mood-bg-dim absolute inset-0" />
      </div>
    );
  }

  // Blank uses the body --bg
  if (bgType === BgType.Blank) return null;

  // Light mode has only bloom
  if (activeMode === ThemeMode.Light) return <BloomBackground />;

  switch (bgType) {
    case BgType.Bloom:
      return <BloomBackground />;
    case BgType.Flow:
      return <FlowBackground />;
    case BgType.Drift:
      return <DriftBackground />;
    default:
      return <BloomBackground />;
  }
}
