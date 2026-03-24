import { useEffect, useState } from 'react';
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

  // Watch for external changes to --background-type (e.g. mood system)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const val = (
        getComputedStyle(document.documentElement)
          .getPropertyValue(BG_CSS_VAR)
          .trim() || getSetting(SettingsKey.BackgroundType) || BgType.Bloom
      ) as BgType;
      setBgType((prev) => (prev !== val ? val : prev));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => observer.disconnect();
  }, []);

  // Image overlays a background image
  if (bgType === BgType.Image && backgroundUrl) {
    return <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none bg-cover bg-center" style={{ backgroundImage: `url(${backgroundUrl})` }} />;
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
