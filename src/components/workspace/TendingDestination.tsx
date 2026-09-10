import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { validateTendingTarget } from '@/services/tending-actions';
import type { TendingTarget } from '@/services/tending-state';

/** Routing reveals and focuses a decision; it never answers one. */
export default function TendingDestination() {
  const location = useLocation();
  const [error, setError] = useState('');
  useEffect(() => {
    const target = (location.state as { tending?: TendingTarget } | null)?.tending;
    if (!target) return;
    try {
      // Opening acknowledges a result, so only requests retain attention identity here.
      const w = validateTendingTarget({
        ...target,
        attentionId: target.attentionId?.startsWith('permission:') ? target.attentionId : undefined,
      });
      w.ui.getState().setPaneVisible('collaboration', true);
      w.ui.getState().setMobileActivePane('collaboration');
      const request = target.attentionId?.startsWith('permission:')
        ? target.attentionId.split(':').at(-1)
        : undefined;
      const frame = requestAnimationFrame(() => {
        const root = document.querySelector(`[data-workspace-id="${CSS.escape(target.copyId)}"]`);
        const el = root?.querySelector<HTMLElement>(
          request ? `[data-tending-request="${CSS.escape(request)}"]` : '[data-testid="turn-job"]',
        );
        if (el) {
          el.tabIndex = -1;
          el.focus();
          el.scrollIntoView({ block: 'nearest' });
        }
      });
      return () => cancelAnimationFrame(frame);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [location.key, location.state]);
  return error ? (
    <p role="alert" className="p-3 text-error">
      {error}
    </p>
  ) : null;
}
