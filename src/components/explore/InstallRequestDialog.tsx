import { useEffect, useState } from 'react';
import { publicApi } from '@/api';
import { Modal } from '@/components/ui';
import { linkClass } from '@/components/ui/button-class';
import { openGardenPage } from '@/lib/public-url';
import {
  installFallbackCopy,
  lookUpPublished,
  useInstallRequest,
  type InstallRequest,
  type PublishedLookup,
} from '@/services/install-requests';
import PublishedCreationCard from './PublishedCreationCard';

/**
 * The confirmation an "Open in Crux Garden" link opens: the Tool or Mood with
 * its details and its own Install button. Nothing is installed until the
 * person presses it. Link-only items are found by id, not through Explore.
 */
export default function InstallRequestDialog() {
  const request = useInstallRequest((s) => s.request);
  const clear = useInstallRequest((s) => s.clear);
  const [state, setState] = useState<PublishedLookup | { kind: 'looking' }>({ kind: 'looking' });

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setState({ kind: 'looking' });
    void lookUpPublished(request, publicApi.getPublishedPackage, controller.signal).then(
      (found) => {
        if (!controller.signal.aborted) setState(found);
      },
    );
    return () => controller.abort();
  }, [request]);

  if (!request) return null;
  const noun = request.type === 'tool' ? 'Tool' : 'Mood';
  return (
    <Modal open onClose={clear} size="md" title={`Install this ${noun}?`}>
      <div className="flex flex-col gap-3" data-testid="install-request" data-state={state.kind}>
        {state.kind === 'found' ? (
          <>
            <p className="text-xs text-text-muted">
              Review it, then press Install. Nothing is installed until you do.
            </p>
            <PublishedCreationCard crux={state.crux} onTag={() => {}} />
          </>
        ) : state.kind === 'looking' ? (
          <p className="text-sm text-text-muted" role="status">
            {`Looking for this ${noun} on crux.garden…`}
          </p>
        ) : (
          <Fallback type={request.type} kind={state.kind} />
        )}
      </div>
    </Modal>
  );
}

function Fallback({
  type,
  kind,
}: {
  type: InstallRequest['type'];
  kind: Exclude<PublishedLookup['kind'], 'found'>;
}) {
  const copy = installFallbackCopy(type, kind);
  return (
    <>
      <p className="text-sm text-text-muted" role="status">
        {copy.message}
      </p>
      <p className="text-xs text-text-muted">
        <button
          type="button"
          className={linkClass()}
          data-testid="install-request-download"
          onClick={() =>
            void openGardenPage(`/explore?type=${type === 'tool' ? 'tools' : 'moods'}`)
          }
        >
          {copy.link}
        </button>{' '}
        to download its {copy.file} file.
      </p>
    </>
  );
}
