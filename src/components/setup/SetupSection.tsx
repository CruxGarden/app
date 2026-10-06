import { useId, type ReactNode } from 'react';
import { buttonClass } from '@/components/ui';
import { cn } from '@/lib/cn';
import { Looking, ReadyMark } from './setup-ui';

/**
 * One section of "How you'll use AI": a title, its live status, and Set up /
 * Later. Closed it is one quiet row; open it holds the same controls Settings
 * uses for the same thing.
 */
export default function SetupSection({
  id,
  title,
  status,
  ready,
  checking,
  open,
  onOpen,
  onLater,
  children,
}: {
  id: string;
  title: string;
  status: string;
  /** Status reads as done (accent) rather than waiting. */
  ready?: boolean;
  /** Still finding out (detection running). */
  checking?: boolean;
  open: boolean;
  onOpen: () => void;
  onLater: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const bodyId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-setup-section={id}
      data-open={open ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      data-checking={checking ? 'true' : 'false'}
      className={cn(
        'rounded-[var(--radius-sm)] border transition-[border-color,background-color]',
        open ? 'border-accent bg-surface' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
        {ready && <ReadyMark />}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-medium text-text">
            {title}
          </h3>
          <p
            role="status"
            aria-live="polite"
            className={cn('text-xs', ready ? 'text-accent' : 'text-text-muted')}
            data-testid={`setup-status-${id}`}
          >
            {checking && <Looking />}
            <span key={status} className="motion-enter-bubble inline-block">
              {status}
            </span>
          </p>
        </div>
        {open ? (
          <button
            type="button"
            className={buttonClass('ghost', 'xs')}
            aria-expanded="true"
            aria-controls={bodyId}
            aria-label={`Close: ${title}`}
            onClick={onLater}
          >
            Close
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass('secondary', 'xs')}
            aria-expanded="false"
            aria-label={`${ready ? 'Change' : 'Set up'}: ${title}`}
            onClick={onOpen}
          >
            {ready ? 'Change' : 'Set up'}
          </button>
        )}
      </div>
      {open && (
        <div id={bodyId} className="px-3 pb-3 flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
