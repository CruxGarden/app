import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Artifact, ChatMessage, Crux } from '@/api/types';
import { Modal } from '@/components/ui';
import { PublicTopBar, ArtifactRenderer } from '@/components/display';
import PublicCruxAbout from '@/components/public/PublicCruxAbout';
import { getServices } from '@/services';
import { publicationPlan, publishableArtifacts } from '@/services/publication-plan';
import { startPreviewServer, stopPreviewServer } from '@/services/preview-server';
import { sharedConversation } from '@/services/shared-conversation';
import { Capability, can } from '@/lib/platform';
import { pathOf } from '@/lib/artifact-path';

/** What visitors will land on: the declared entry, else index.html. */
function entryOf(crux: Crux, files: Artifact[]): string | null {
  const declared = String(crux.meta?.settings?.entryFile ?? '').replace(/^\/+/, '');
  if (declared && files.some((file) => pathOf(file) === declared)) return declared;
  return files.some((file) => pathOf(file) === 'index.html') ? 'index.html' : null;
}

/**
 * "Preview as a visitor": the public framing of this Crux — the top bar, the
 * creation and "About this creation" with the conversation exactly as it
 * would be shared — rendered from this machine. Nothing is uploaded.
 */
export default function VisitorPreview({
  open,
  onClose,
  crux,
  artifacts,
  messages,
  username,
}: {
  open: boolean;
  onClose: () => void;
  crux: Crux;
  artifacts: Artifact[];
  messages: ChatMessage[];
  username: string;
}) {
  const [aboutOpen, setAboutOpen] = useState(true);
  const files = useMemo(() => {
    const plan = publicationPlan(crux, artifacts);
    return plan.kind === 'static'
      ? plan.files.map(({ file }) => file)
      : publishableArtifacts(artifacts);
  }, [crux, artifacts]);
  const entry = entryOf(crux, files);
  const live = !!entry && can(Capability.PreviewServer);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [serverError, setServerError] = useState(false);

  // The same local server the Workshop uses (ADR 0003); leased, so the
  // Workshop's own preview keeps running when this dialog closes.
  useEffect(() => {
    if (!open || !live) return;
    let cancelled = false;
    setServerError(false);
    startPreviewServer(crux.id)
      .then((url) => {
        if (!cancelled) setServerUrl(url || null);
        if (!cancelled && !url) setServerError(true);
      })
      .catch(() => {
        if (!cancelled) setServerError(true);
      });
    return () => {
      cancelled = true;
      setServerUrl(null);
      void stopPreviewServer(crux.id);
    };
  }, [open, live, crux.id]);

  const downloadBlob = useCallback(
    async (artifactId: string) => {
      const artifact = artifacts.find((item) => item.id === artifactId);
      if (!artifact) throw new Error('This file is not part of the creation.');
      return getServices().artifact.downloadBlob(artifact);
    },
    [artifacts],
  );

  const shared = sharedConversation(crux, messages);
  const handle = username ? `@${username.replace(/^@/, '')}` : '@you';

  return (
    <Modal open={open} onClose={onClose} size="full" flush aria-label="Preview as a visitor">
      <div className="flex flex-col h-full min-h-0" data-testid="visitor-preview">
        <div className="shrink-0 px-3 py-1.5 border-b border-border bg-panel text-xs text-text-muted">
          Preview as a visitor — from this computer. Nothing is uploaded.
        </div>
        <PublicTopBar
          preview
          title={crux.title}
          username={handle}
          hasMetadata
          metadataOpen={aboutOpen}
          onToggleMetadata={() => setAboutOpen((value) => !value)}
        />
        <div className="flex-1 min-h-0 flex bg-bg">
          <div className={`flex-1 min-w-0 ${aboutOpen ? 'hidden sm:block' : ''}`}>
            {live ? (
              serverUrl ? (
                <iframe
                  title={`${crux.title || 'Creation'} as visitors see it`}
                  src={`${serverUrl}/${entry === 'index.html' ? '' : entry}`}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  className="w-full h-full border-0"
                />
              ) : (
                <p className="p-4 text-sm text-text-muted" role="status">
                  {serverError ? 'Could not start the local preview.' : 'Starting the preview…'}
                </p>
              )
            ) : entry ? (
              <p className="p-4 text-sm text-text-muted">
                Open the Workshop to see this page; the panel shows what visitors read about it.
              </p>
            ) : (
              <ArtifactRenderer
                artifacts={files}
                username={handle}
                slug={crux.slug}
                cruxId={crux.id}
                downloadBlob={downloadBlob}
              />
            )}
          </div>
          {aboutOpen && (
            <PublicCruxAbout
              crux={crux}
              username={handle}
              transcript={shared ?? []}
              conversation={shared && shared.length ? 'shared' : 'private'}
              preview
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
