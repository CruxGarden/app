import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import CruxBloom from '@/components/brand/CruxBloom';
import { Panel, buttonClass } from '@/components/ui';

/**
 * A page that leads nowhere — a 404, a garden or a creation that is not there,
 * a server that did not answer. Always on a panel, never loose on the field
 * (Daniel, 2026-09-27: "text should always be on a panel or inner panel"),
 * and always with a way back.
 */
export default function DeadEnd({
  title,
  body,
  children,
}: {
  title: string;
  body: ReactNode;
  /** The ways back; the Garden by default. */
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <Panel
        as="section"
        aria-label={title}
        padding="lg"
        className="relative z-10 w-full max-w-md text-center motion-enter-card"
      >
        <CruxBloom size={48} className="mx-auto mb-5 opacity-40" />
        <h1 className="font-display text-2xl text-heading mb-2">{title}</h1>
        <p className="text-sm text-text-muted mb-6">{body}</p>
        <nav aria-label="Way back" className="flex flex-wrap items-center justify-center gap-2">
          {children ?? (
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() => navigate('/')}
            >
              Return to Garden
            </button>
          )}
        </nav>
      </Panel>
    </div>
  );
}
