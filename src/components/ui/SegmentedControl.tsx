import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { segmentClass, segmentGroupClass } from './button-class';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Thumb {
  x: number;
  y: number;
  w: number;
  h: number;
}

const sameThumb = (a: Thumb | null, b: Thumb | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/**
 * A row of exclusive choices — views, sort orders, billing intervals — one
 * piece, the chosen segment lit with the accent. The light slides to the new
 * choice rather than jumping (the Mood's base duration; instant with Motion
 * off). Buttons carry `aria-pressed` so the choice reads to assistive tech
 * and to the journeys.
 */
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'sm',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly Segment<T>[];
  /** The group's accessible name. */
  label: string;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  // Callers pass `options` inline, a new array every render: key the effect on
  // what the options say, not on the array, or it re-subscribes every render.
  const optionKey = options.map((o) => `${o.value}:${o.label}`).join('|');
  useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    const measure = () => {
      const chosen = root.querySelector<HTMLElement>('[aria-pressed="true"]');
      const next = chosen
        ? {
            x: chosen.offsetLeft,
            y: chosen.offsetTop,
            w: chosen.offsetWidth,
            h: chosen.offsetHeight,
          }
        : null;
      // The same place is the same state: no re-render, so no loop with the observer.
      setThumb((prev) => (sameThumb(prev, next) ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [value, optionKey]);

  return (
    <div ref={group} role="group" aria-label={label} className={segmentGroupClass(className)}>
      {thumb && (
        <span
          aria-hidden
          className="segment-thumb absolute left-0 top-0 rounded-[calc(var(--radius-sm)-2px)] bg-accent-muted shadow-[0_1px_2px_rgb(0_0_0/0.18)]"
          style={{
            width: thumb.w,
            height: thumb.h,
            transform: `translate(${thumb.x}px, ${thumb.y}px)`,
          }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={segmentClass(
              active,
              size,
              cn(thumb && active && 'bg-transparent shadow-none', size === 'xs' && 'font-mono'),
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
