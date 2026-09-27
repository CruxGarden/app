import { useState, type ReactNode } from 'react';
import { Panel } from '@/components/ui';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/**
 * One card of the Settings pane: a title in the settings token family, an
 * optional note beside it (a count, a version, a status), an optional line
 * under it, and the controls. `collapsible` folds the controls behind the
 * title; sections a person visits rarely start folded.
 */
export default function SettingsSection({
  title,
  aside,
  description,
  collapsible = false,
  defaultCollapsed = true,
  testId,
  className,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  description?: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  testId?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const heading = <h2 className="font-display text-sm font-medium text-settings-label">{title}</h2>;
  return (
    <Panel
      as="section"
      aria-label={typeof title === 'string' ? title : undefined}
      padding="md"
      // A narrow pane at a large text size: long paths and addresses break
      // rather than push the section sideways.
      className={cn('min-w-0 break-words', className)}
      data-testid={testId}
    >
      <div className={cn('flex items-baseline justify-between gap-3', !collapsed && 'mb-3')}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            className="group flex items-center gap-2 -ml-1.5 px-1.5 py-0.5 rounded-[var(--radius-sm)] hover:bg-action-button-hover cursor-pointer"
          >
            <ChevronDownIcon
              className={cn(
                'text-text-muted group-hover:text-text transition-transform',
                collapsed ? '-rotate-90' : 'rotate-0',
              )}
            />
            {heading}
          </button>
        ) : (
          heading
        )}
        {aside && <span className="text-xxs font-mono text-text-muted">{aside}</span>}
      </div>
      {!collapsed && description && <p className="text-xs text-text-muted mb-4">{description}</p>}
      {!collapsed &&
        (collapsible ? <div className="motion-enter-dropdown">{children}</div> : children)}
    </Panel>
  );
}
