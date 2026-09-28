import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useToastStore, type Toast } from '@/stores/toastStore';
import { useMotionRole } from '@/hooks/useMotionRole';
import { buttonClass, iconButtonClass } from './button-class';
import { CloseIcon } from './icons';
import { cn } from '@/lib/cn';

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const role = useMotionRole('toast');
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const left = useRef(toast.duration);
  const started = useRef(Date.now());
  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const timer = window.setTimeout(() => dismiss(toast.id), left.current);
    return () => {
      window.clearTimeout(timer);
      left.current -= Date.now() - started.current;
    };
  }, [paused, dismiss, toast.id]);
  return (
    <motion.div
      layout
      role={toast.tone === 'error' ? 'alert' : 'status'}
      data-testid="toast"
      data-motion-role="toast"
      initial={role.initial}
      animate={role.animate}
      exit={role.exit}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className={cn(
        'overlay-plate pointer-events-auto flex items-center gap-3 min-w-64 max-w-md pl-4 pr-1.5 py-1.5',
        'rounded-dropdown border border-dropdown-border shadow-dropdown text-sm',
        toast.tone === 'error' ? 'text-error' : 'text-text',
      )}
    >
      <span className="flex-1 min-w-0 py-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          disabled={busy}
          className={buttonClass('secondary', 'xs')}
          onClick={async () => {
            setBusy(true);
            try {
              await toast.action!.run();
            } finally {
              dismiss(toast.id);
            }
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className={iconButtonClass('xs')}
        onClick={() => dismiss(toast.id)}
      >
        <CloseIcon size={12} />
      </button>
    </motion.div>
  );
}

/** Where toasts appear: bottom centre, above everything but dialogs' questions. */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      aria-live="polite"
      className="fixed inset-x-0 bottom-5 z-[65] flex flex-col items-center gap-2 pointer-events-none px-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
