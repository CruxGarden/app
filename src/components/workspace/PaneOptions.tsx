import { useState, type ReactNode } from 'react';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
import { PANES, type PaneType } from './paneConfig';

/** A panel's secondary controls retain their state as the installation level changes. */
export default function PaneOptions({
  pane,
  label = 'More options',
  children,
}: {
  pane: PaneType;
  label?: string;
  children: ReactNode;
}) {
  const advanced = useAdvancedMode();
  const mode = advanced ? 'advanced' : 'normal';
  const [choices, setChoices] = useState<Partial<Record<'normal' | 'advanced', boolean>>>({});
  const expanded = choices[mode] ?? PANES[pane].layouts[mode].options === 'expanded';
  const choose = (open: boolean) => setChoices((current) => ({ ...current, [mode]: open }));
  return (
    <details
      open={expanded}
      onToggle={(event) => {
        if (event.currentTarget.open !== expanded) choose(event.currentTarget.open);
      }}
      className="shrink-0 min-w-0 rounded-[var(--radius-sm)] border border-border p-2"
      data-panel-options={pane}
    >
      <summary
        className="cursor-pointer text-xs text-accent"
        onClick={(event) => {
          // Commit the choice before another render can restore the old open prop.
          // Native summary keyboard activation also dispatches this click.
          event.preventDefault();
          choose(!expanded);
        }}
      >
        {label}
      </summary>
      <div className="flex flex-wrap items-start gap-2 pt-2">{children}</div>
    </details>
  );
}
