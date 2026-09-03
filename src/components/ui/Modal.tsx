import { type ReactNode, useEffect } from 'react';
import { cn } from '@/lib/cn';
import Panel from './Panel';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'screen' | 'full';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm w-full mx-4',
  md: 'max-w-md w-full mx-4',
  lg: 'max-w-2xl w-full mx-4',
  xl: 'max-w-5xl w-full mx-4',
  screen: 'w-[calc(100vw-6rem)] max-w-3xl h-[calc(100vh-6rem)]',
  full: 'w-[calc(100vw-3rem)] h-[calc(100vh-3rem)]',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Modal size — defaults to 'md' */
  size?: ModalSize;
  /** Title displayed at the top of the modal */
  title?: string;
  /** Subtitle displayed below the title */
  subtitle?: string;
  /** Remove inner content padding (e.g. for edge-to-edge layouts) */
  flush?: boolean;
}

export default function Modal({
  open,
  onClose,
  children,
  className,
  size = 'md',
  title,
  subtitle,
  flush,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // This Escape belongs to the modal: don't let global shortcuts (Shell's
      // Escape → Keeper console) also fire on the same keypress.
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 modal-scrim" onClick={onClose} />
      <Panel
        padding="md"
        className={cn(
          'relative z-10 flex flex-col',
          // Deep soft shadow carries the elevation the blur used to fake
          'shadow-[0_24px_80px_-16px_rgb(0_0_0/0.65)]',
          SIZE_CLASSES[size],
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-sm font-medium text-accent">{title}</h2>
              {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text cursor-pointer"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div
          className={cn(
            'flex-1 min-h-0 flex flex-col overflow-hidden bg-bg/50 rounded-[var(--radius-sm)] border border-border',
            !flush && 'p-4',
          )}
        >
          {children}
        </div>
      </Panel>
    </div>
  );
}
