import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { AnimatePresence, motion } from 'motion/react';
import Panel from './Panel';
import { useMotionRole } from '@/hooks/useMotionRole';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { usePlasmaOn } from '@/components/plasma/usePlasmaOn';
import { FORMING_ATTR } from '@cruxgarden/plasma-ui';

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
  /**
   * Stacking layer. App-level confirm/alert/choice dialogs (DialogHost) use
   * 'top' so they sit above whatever modal asked the question — Settings,
   * a pull, a delete — and stay clickable.
   */
  layer?: 'base' | 'top';
  /** Remove inner content padding (e.g. for edge-to-edge layouts) */
  flush?: boolean;
}

/**
 * Open modals, bottom to top. Only the topmost answers Escape — a confirm over
 * Settings must not take Settings down with it.
 */
const openModals: symbol[] = [];

export default function Modal({
  open,
  onClose,
  children,
  className,
  size = 'md',
  title,
  subtitle,
  layer = 'base',
  flush,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const token = Symbol('modal');
    openModals.push(token);
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openModals[openModals.length - 1] !== token) return;
      // This Escape belongs to the modal: don't let global shortcuts (Shell's
      // Escape → Keeper console) or a modal underneath also fire on the same keypress.
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    // Capture phase on window: first to see the key, ahead of every other handler.
    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      const i = openModals.indexOf(token);
      if (i >= 0) openModals.splice(i, 1);
    };
  }, [open, onClose]);

  // The Mood's dialog motion (ADR 0041): Motion plays the enter on mount and the exit before unmount
  const role = useMotionRole('dialog');
  // Under the Plasma theme the panel is drawn by a second canvas above the scrim (PlasmaOverlay).
  const panelRef = useRef<HTMLDivElement>(null);
  const plasma = usePlasmaOn();

  // Rendered at <body>: a dialog inside a glass surface would otherwise be trapped by the
  // panel's backdrop-filter, which makes that panel the containing block of `fixed` children
  // (the Create Cruxspace dialog was clipped to the Cruxspaces section's height, ADR 0043).
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          key="modal"
          data-modal-open
          className={cn(
            'fixed inset-0 flex items-center justify-center',
            layer === 'top' ? 'z-[70]' : 'z-50',
          )}
        >
          <div className="absolute inset-0 modal-scrim" onClick={onClose} />
          <PlasmaOverlay surface={panelRef} />
          <motion.div
            data-motion-role="dialog"
            data-motion-choice={role.choice.enter}
            data-motion-exit={role.choice.exit}
            initial={role.initial}
            animate={role.animate}
            exit={role.exit}
            className={cn('relative z-10 flex', SIZE_CLASSES[size])}
          >
            <Panel
              ref={panelRef}
              // Marked as forming from the first paint, so the contents never
              // show before the material: the overlay's renderer clears the
              // mark when the surface has formed, or at once if it cannot draw.
              {...(plasma ? { [FORMING_ATTR]: '' } : {})}
              padding="md"
              className={cn(
                'flex flex-col w-full h-full',
                // Deep soft shadow carries the elevation the blur used to fake
                'shadow-modal',
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
