import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import LiquidGlass from 'liquid-glass-react';
import { cn } from '@/lib/cn';

/**
 * A floating, self-sized surface — a dropdown, a menu — rendered
 * as Apple-style liquid glass while the person's switch is on (ADR 0043):
 * `liquid-glass-react` (MIT) bends and refracts what sits behind it, adds
 * chromatic aberration at the edges and follows the pointer with a little
 * elasticity. Everything it needs comes from the glass tokens: blur,
 * saturation and refraction from the Mood, elasticity and aberration from
 * the person's motion intensity (still under off and subtle). With the
 * switch off it renders its children untouched.
 *
 * Anything that takes part in a layout (pane bodies, dialogs, the TopBar,
 * the Mood bar, cards in the garden grid) is not wrapped: the library sizes
 * itself around measured content and breaks grids and constrained heights;
 * those take the CSS frost in styles/glass.css instead.
 */
interface GlassTokens {
  glass: boolean;
  blur: number;
  saturation: number;
  refraction: number;
  radius: number;
  animate: boolean;
  expressive: boolean;
}

function readGlassTokens(): GlassTokens {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const px = (name: string, fallback: number) => {
    const n = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(n) ? n : fallback;
  };
  const intensity = root.dataset.motionIntensity ?? 'normal';
  return {
    glass: root.dataset.surfaceStyle === 'glass',
    blur: px('--glass-blur', 12),
    saturation: px('--glass-saturation', 150),
    refraction: Math.max(0, Math.min(1, px('--glass-refraction', 0.35))),
    radius: px('--radius', 12),
    animate: intensity === 'normal' || intensity === 'expressive',
    expressive: intensity === 'expressive',
  };
}

function useGlassTokens(): GlassTokens {
  const [tokens, setTokens] = useState(() => readGlassTokens());
  useEffect(() => {
    const update = () => setTokens(readGlassTokens());
    update();
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, []);
  return tokens;
}

export default function GlassSurface({
  children,
  className,
  style,
  radius,
  role,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Corner radius in px; defaults to the Mood's --radius. */
  radius?: number;
  /** For evidence: what this surface is. */
  role: 'dropdown';
}) {
  const t = useGlassTokens();
  if (!t.glass) return <>{children}</>;
  return (
    <LiquidGlass
      className={cn('glass-surface', className)}
      style={{ display: 'flex', width: '100%', ...style }}
      displacementScale={Math.round(t.refraction * 70)}
      blurAmount={t.blur / 32}
      saturation={t.saturation}
      aberrationIntensity={t.expressive ? 3 : 1.5}
      elasticity={t.animate ? (t.expressive ? 0.25 : 0.12) : 0}
      cornerRadius={radius ?? t.radius}
      padding="0"
      mode="standard"
    >
      <div data-glass-role={role} className="glass-surface-content flex w-full">
        {children}
      </div>
    </LiquidGlass>
  );
}
