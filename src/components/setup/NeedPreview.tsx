import type { ReactNode } from 'react';
import type { SetupNeed } from './setup-plan';

/**
 * A tiny picture of what each kind of Crux looks like, drawn from the Mood's
 * tokens so it re-skins with the wizard. Decorative: the card's words say it.
 */
export default function NeedPreview({ need }: { need: SetupNeed }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 40"
      className="w-16 h-10 shrink-0 rounded-[var(--radius-sm)] border border-border bg-bg"
    >
      {DRAWINGS[need]}
    </svg>
  );
}

const ink = 'var(--text-muted)';
const accent = 'var(--accent)';
const soft = 'var(--accent-muted)';
const line = 'var(--border)';

const Bar = ({
  x,
  y,
  w,
  h = 2,
  fill = ink,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  fill?: string;
}) => <rect x={x} y={y} width={w} height={h} rx={1} fill={fill} />;

const DRAWINGS: Record<SetupNeed, ReactNode> = {
  website: (
    <>
      <rect x="0" y="0" width="64" height="7" fill={soft} />
      <circle cx="4" cy="3.5" r="1.2" fill={accent} />
      <circle cx="20" cy="20" r="6" fill={soft} stroke={accent} />
      <Bar x={30} y={15} w={22} h={3} fill={accent} />
      <Bar x={30} y={21} w={26} />
      <Bar x={30} y={25} w={18} />
      <Bar x={8} y={32} w={48} fill={line} />
    </>
  ),
  app: (
    <>
      <rect x="6" y="6" width="30" height="5" rx="1" fill="none" stroke={ink} />
      <rect x="6" y="14" width="30" height="5" rx="1" fill="none" stroke={ink} />
      <rect x="6" y="23" width="14" height="6" rx="1.5" fill={accent} />
      <ellipse cx="50" cy="12" rx="8" ry="3" fill={soft} stroke={accent} />
      <path d="M42 12 v14 a8 3 0 0 0 16 0 v-14" fill={soft} stroke={accent} />
      <path d="M42 19 a8 3 0 0 0 16 0" fill="none" stroke={accent} />
    </>
  ),
  writing: (
    <>
      <rect x="14" y="4" width="36" height="32" rx="2" fill={soft} stroke={line} />
      <Bar x={19} y={9} w={20} h={3} fill={accent} />
      <Bar x={19} y={16} w={26} />
      <Bar x={19} y={20} w={24} />
      <Bar x={19} y={24} w={26} />
      <Bar x={19} y={28} w={14} />
    </>
  ),
  music: (
    <>
      {[10, 18, 26, 34, 42, 50].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={32 - [12, 20, 8, 24, 16, 10][i]!}
          width="5"
          height={[12, 20, 8, 24, 16, 10][i]}
          rx="1"
          fill={i % 2 ? accent : soft}
        />
      ))}
      <path d="M6 34 H58" stroke={line} />
    </>
  ),
  art: (
    <>
      <rect x="6" y="5" width="52" height="30" rx="2" fill={soft} stroke={line} />
      <circle cx="22" cy="17" r="6" fill={accent} />
      <path d="M10 33 L26 22 L36 29 L44 20 L56 33 Z" fill={ink} />
    </>
  ),
  game: (
    <>
      <rect x="0" y="30" width="64" height="10" fill={soft} />
      <rect x="14" y="20" width="6" height="10" fill={accent} />
      <rect x="15" y="16" width="4" height="4" fill={accent} />
      <rect x="34" y="22" width="8" height="8" fill={line} />
      <rect x="46" y="14" width="8" height="8" fill={line} />
      <circle cx="50" cy="8" r="2" fill={accent} />
    </>
  ),
  exploring: (
    <>
      <circle cx="32" cy="20" r="13" fill={soft} stroke={line} />
      <path d="M32 9 L36 20 L32 31 L28 20 Z" fill={accent} />
      <circle cx="32" cy="20" r="2" fill="var(--bg)" />
    </>
  ),
};
