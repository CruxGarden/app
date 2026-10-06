import type { CSSProperties, ReactNode } from 'react';
import { useStillMotion } from './useStillMotion';

/**
 * The Setup wizard's progress: a small garden that grows a stage per finished
 * step — a seed, a sprout, leaves, a bud — and blooms when the garden is
 * planted. Drawn from the Mood's tokens (accent, accent-muted, border,
 * surface) and timed by its motion tokens, so a Mood re-skins it and motion
 * off (or prefers-reduced-motion) shows each stage still.
 */
export default function GardenGrowth({
  stage,
  stages,
  label,
}: {
  /** 0 = a seed; `stages` = in bloom. */
  stage: number;
  stages: number;
  label: string;
}) {
  const still = useStillMotion();
  const at = (n: number) => stage >= n;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 120 64"
      className="h-14 w-auto shrink-0 overflow-visible"
      data-testid="setup-garden-growth"
      data-stage={stage}
      data-stages={stages}
      data-motion={still ? 'still' : 'moving'}
    >
      {/* Soil */}
      <path
        d="M6 56 Q 30 51 60 54 T 114 55"
        fill="none"
        stroke="var(--border)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Grow show={at(0)} still={still}>
        <ellipse cx="60" cy="56" rx="4" ry="2.5" fill="var(--accent)" />
      </Grow>
      {/* Sprout */}
      <Grow show={at(1)} still={still}>
        <path
          d="M60 56 C 60 48 60 44 60 38"
          stroke="var(--accent)"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        <Leaf d="M60 44 C 54 44 51 40 52 37 C 56 37 59 40 60 44 Z" />
        <Leaf d="M60 42 C 66 42 69 38 68 35 C 64 35 61 38 60 42 Z" />
      </Grow>
      {/* Taller, with leaves */}
      <Grow show={at(2)} still={still}>
        <path
          d="M60 38 C 60 32 61 28 60 22"
          stroke="var(--accent)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <Leaf d="M60 33 C 51 34 47 29 48 25 C 54 25 59 28 60 33 Z" />
        <Leaf d="M60 30 C 69 31 73 26 72 22 C 66 22 61 25 60 30 Z" />
      </Grow>
      {/* Companions along the bed */}
      <Grow show={at(3)} still={still}>
        <path d="M30 54 C 30 49 31 47 30 44" stroke="var(--accent)" strokeWidth="1.6" fill="none" />
        <Leaf d="M30 48 C 26 48 25 45 25.5 43.5 C 28 43.5 30 45.5 30 48 Z" />
        <path d="M88 55 C 88 50 87 48 88 45" stroke="var(--accent)" strokeWidth="1.6" fill="none" />
        <Leaf d="M88 49 C 92 49 93 46 92.5 44.5 C 90 44.5 88 46.5 88 49 Z" />
      </Grow>
      {/* Bud */}
      <Grow show={at(4) && !at(5)} still={still}>
        <path d="M60 22 C 56 18 57 13 60 11 C 63 13 64 18 60 22 Z" fill="var(--accent)" />
      </Grow>
      {/* Bloom: the garden is planted */}
      <Grow show={at(5)} still={still}>
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse
            key={angle}
            cx="60"
            cy="10"
            rx="3.6"
            ry="6"
            fill="var(--accent)"
            transform={`rotate(${angle} 60 16)`}
          />
        ))}
        <circle cx="60" cy="16" r="3" fill="var(--surface)" />
        <circle cx="30" cy="42" r="2.4" fill="var(--accent)" />
        <circle cx="88" cy="43" r="2.4" fill="var(--accent)" />
      </Grow>
      <Grow show={at(5)} still={still} delay>
        {SPARKLES.map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y - 3} L${x + 0.9} ${y - 0.9} L${x + 3} ${y} L${x + 0.9} ${y + 0.9} L${x} ${y + 3} L${x - 0.9} ${y + 0.9} L${x - 3} ${y} L${x - 0.9} ${y - 0.9} Z`}
            fill="var(--accent)"
          />
        ))}
      </Grow>
    </svg>
  );
}

const SPARKLES: [number, number][] = [
  [40, 14],
  [82, 10],
  [22, 30],
  [100, 30],
];

function Leaf({ d }: { d: string }) {
  return <path d={d} fill="var(--accent-muted)" stroke="var(--accent)" strokeWidth="1" />;
}

/** A stage rises from the soil on the Mood's slow enter; still when motion is off. */
function Grow({
  show,
  still,
  delay,
  children,
}: {
  show: boolean;
  still: boolean;
  delay?: boolean;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    transformBox: 'fill-box',
    transformOrigin: '50% 100%',
    transform: show ? 'scale(1)' : 'scale(0.2)',
    opacity: show ? 1 : 0,
    transition: still
      ? 'none'
      : 'transform var(--motion-ms-slow) var(--motion-ease-enter), opacity var(--motion-ms-base) var(--motion-ease-standard)',
    transitionDelay: delay && !still ? 'var(--motion-ms-base)' : undefined,
  };
  return (
    <g style={style} data-shown={show ? 'true' : 'false'}>
      {children}
    </g>
  );
}
