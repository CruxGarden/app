import { useEffect, useState } from 'react';
import { publicApi } from '@/api';
import type { ExploreCrux } from '@/api/public';
import { Modal } from '@/components/ui';
import { findPublished, useInstallRequest } from '@/services/install-requests';
import PublishedCreationCard from './PublishedCreationCard';

/**
 * The confirmation an "Open in Crux Garden" link opens: the Tool or Mood with
 * its details and its own Install button. Nothing is installed until the
 * person presses it.
 */
export default function InstallRequestDialog() {
  const request = useInstallRequest((s) => s.request);
  const clear = useInstallRequest((s) => s.clear);
  const [state, setState] = useState<
    { kind: 'looking' } | { kind: 'found'; crux: ExploreCrux } | { kind: 'missing' | 'offline' }
  >({ kind: 'looking' });

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setState({ kind: 'looking' });
    findPublished(request, publicApi.explore, controller.signal)
      .then((crux) => {
        if (!controller.signal.aborted)
          setState(crux ? { kind: 'found', crux } : { kind: 'missing' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'offline' });
      });
    return () => controller.abort();
  }, [request]);

  if (!request) return null;
  const noun = request.type === 'tool' ? 'Tool' : 'Mood';
  const file = request.type === 'tool' ? '.cruxtool' : '.cruxmood';
  return (
    <Modal open onClose={clear} size="md" title={`Install this ${noun}?`}>
      <div className="flex flex-col gap-3" data-testid="install-request">
        {state.kind === 'found' ? (
          <>
            <p className="text-xs text-text-muted">
              Review it, then press Install. Nothing is installed until you do.
            </p>
            <PublishedCreationCard crux={state.crux} onTag={() => {}} />
          </>
        ) : (
          <p className="text-sm text-text-muted" role="status">
            {state.kind === 'looking'
              ? `Looking for this ${noun} on crux.garden…`
              : state.kind === 'offline'
                ? `Could not reach crux.garden to find this ${noun}. Try the link again when you are online.`
                : `This ${noun} is not listed in Explore. Download its ${file} file from its page, then import it from Add Crux.`}
          </p>
        )}
      </div>
    </Modal>
  );
}
