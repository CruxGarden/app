import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import Spinner from './Spinner';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { usePlasmaOn } from '@/components/plasma/usePlasmaOn';

type Size = 'sm' | 'md' | 'lg';

interface PlasmaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2.5',
};

/**
 * The one button that is the material (Daniel, 2026-09-19: "one delicious
 * looking button that looks like our panels, but as a button, and when you
 * hover, the iridescence fills the button, making it glow and swirl … is
 * the button webgl? I need it to match the plasma").
 *
 * Under Plasma it is drawn by its own clear-ground canvas (PlasmaOverlay,
 * the way a dialog is): a shape the ground drew inside a pane's shape would
 * fuse into the pane and never be seen, and the ground cannot reach into a
 * dialog. Its own canvas can. On hover the shader's sheen and halo are
 * driven up and the rim brightens — the iridescence fills the body — and a
 * blurred swirl rides over it. Elsewhere it is a frosted plate with an
 * iridescent hairline (globals.css).
 */
export default function PlasmaButton({
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: PlasmaButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const on = usePlasmaOn();
  // The shape takes the button's own corner (the Mood's button radius), so
  // the material and the box agree — a rounder shape read as a second,
  // squarer plate behind it (Daniel: "the border radius needs to be more
  // defined, too rounded, and a weird effect, that black border outside").
  const [radius, setRadius] = useState(8);
  useEffect(() => {
    const read = () => {
      if (!ref.current) return;
      const r = parseFloat(getComputedStyle(ref.current).borderTopLeftRadius);
      if (Number.isFinite(r) && r >= 0) setRadius(r);
    };
    read();
    // A Mood change moves the corner (Office: 0); the shape follows.
    document.addEventListener('palette-change', read);
    return () => document.removeEventListener('palette-change', read);
  }, [on]);
  // The hover lift, 0 at rest to 1 under the pointer, eased over a few frames.
  const [lift, setLift] = useState(0);
  const target = useRef(0);
  const frame = useRef(0);
  const ease = () => {
    cancelAnimationFrame(frame.current);
    const step = () => {
      setLift((v) => {
        const next = v + (target.current - v) * 0.18;
        const settled = Math.abs(next - target.current) < 0.005;
        if (!settled) frame.current = requestAnimationFrame(step);
        return settled ? target.current : next;
      });
    };
    frame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const lit = (up: boolean) => {
    target.current = up && !disabled && !loading ? 1 : 0;
    ease();
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      // The overlay marks the button `data-plasma-overlay` while its material
      // is live; plasma.css takes the plate away then.
      data-plasma-host=""
      className={cn(
        'plasma-button relative z-[1] inline-flex items-center justify-center overflow-hidden',
        'font-body font-medium rounded-button cursor-pointer',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      onPointerEnter={(e) => {
        lit(true);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        lit(false);
        onPointerLeave?.(e);
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) lit(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        lit(false);
        onBlur?.(e);
      }}
      {...props}
    >
      {on && (
        <PlasmaOverlay
          surface={ref}
          radius={radius}
          always
          portal
          zIndex={0}
          canvasStyle={{ pointerEvents: 'none' }}
          // Flat at rest (Daniel: "less elevation, maybe none"); under the
          // pointer the sheen brightens and races — the iridescence moving
          // inside as it does on the edge — the halo comes up, the rim doubles.
          overrides={{
            shimmer: 0.8 + 6 * lift,
            shimmerSpeed: 1 + 34 * lift,
            glow: 0.1 + 1.8 * lift,
            rimScale: 1 + 1.2 * lift,
            elevation: 0.06 + 0.2 * lift,
          }}
        />
      )}
      <span className="plasma-button-swirl" aria-hidden="true" />
      <span className="relative inline-flex items-center gap-[inherit]">
        {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : null}
        {children}
      </span>
    </button>
  );
}
