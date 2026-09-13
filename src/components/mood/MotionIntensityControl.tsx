import { useState } from 'react';
import { cn } from '@/lib/cn';
import {
  MOTION_INTENSITY_LABELS,
  motionIntensitySetting,
  setMotionIntensitySetting,
  type MotionIntensitySetting,
} from '@/lib/moods/motion-intensity';

const ORDER: MotionIntensitySetting[] = ['system', 'off', 'subtle', 'normal', 'expressive'];

/**
 * The person's motion intensity (ADR 0041): one select, garden-wide. `System`
 * follows the Mood's default and the OS reduced-motion preference.
 */
export default function MotionIntensityControl({ className }: { className?: string }) {
  const [value, setValue] = useState<MotionIntensitySetting>(() => motionIntensitySetting());
  return (
    <label className={cn('inline-flex items-center gap-1.5 text-xxs text-text-muted', className)}>
      <span>Motion</span>
      <select
        aria-label="Motion intensity"
        value={value}
        onChange={(e) => {
          const next = e.target.value as MotionIntensitySetting;
          setValue(next);
          setMotionIntensitySetting(next);
        }}
        className={cn(
          'h-6 px-1.5 rounded-[var(--radius-sm)] text-xxs font-body',
          'bg-surface text-text border border-border hover:border-accent cursor-pointer',
        )}
      >
        {ORDER.map((v) => (
          <option key={v} value={v}>
            {MOTION_INTENSITY_LABELS[v]}
          </option>
        ))}
      </select>
    </label>
  );
}
