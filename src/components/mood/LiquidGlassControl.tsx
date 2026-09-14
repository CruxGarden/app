import { useState } from 'react';
import { cn } from '@/lib/cn';
import {
  LIQUID_GLASS_LABELS,
  liquidGlassSetting,
  setLiquidGlassSetting,
  type LiquidGlassSetting,
} from '@/lib/moods/liquid-glass';

const ORDER: LiquidGlassSetting[] = ['system', 'on', 'off'];

/** The person's liquid glass switch (ADR 0043): System follows the Mood; On and Off override it. */
export default function LiquidGlassControl({ className }: { className?: string }) {
  const [value, setValue] = useState<LiquidGlassSetting>(() => liquidGlassSetting());
  return (
    <label className={cn('inline-flex items-center gap-1.5 text-xxs text-text-muted', className)}>
      <span>Glass</span>
      <select
        aria-label="Liquid glass"
        value={value}
        onChange={(e) => {
          const next = e.target.value as LiquidGlassSetting;
          setValue(next);
          setLiquidGlassSetting(next);
        }}
        className={cn(
          'h-6 px-1.5 rounded-[var(--radius-sm)] text-xxs font-body',
          'bg-surface text-text border border-border hover:border-accent cursor-pointer',
        )}
      >
        {ORDER.map((v) => (
          <option key={v} value={v}>
            {LIQUID_GLASS_LABELS[v]}
          </option>
        ))}
      </select>
    </label>
  );
}
