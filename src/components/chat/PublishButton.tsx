import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui';
import { publicCruxUrl } from '@/lib/public-url';
import CreateAuthorModal from '@/components/auth/CreateAuthorModal';
import PublishModal from './PublishModal';
import { useShallow } from 'zustand/react/shallow';
import { UploadIcon } from '@/components/ui/icons';

export default function PublishButton() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const author = useAppStore((s) => s.author);
  const { crux, publishCrux } = useCruxStore(
    useShallow((s) => ({ crux: s.crux, publishCrux: s.publishCrux })),
  );
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [publishing, setPublishing] = useState(false);

  const doPublish = useCallback(async () => {
    if (!crux) return;
    const currentAuthor = useAppStore.getState().author;
    if (!currentAuthor) return;

    setPublishing(true);
    try {
      const published = await publishCrux();
      if (!published) {
        // The Share pane renders the failure the store recorded — it has the
        // room for a build log, which is what most failures carry.
        useUIStore.getState().setPaneVisible('publish', true);
        return;
      }
      setPublishedUrl(publicCruxUrl(currentAuthor.username, crux.slug));
      setShowPublishModal(true);
    } finally {
      setPublishing(false);
    }
  }, [crux, publishCrux]);

  const handleClick = useCallback(() => {
    // Not connected — open the Share pane which has the inline connect form
    if (!isAuthenticated) {
      useUIStore.getState().setPaneVisible('publish', true);
      return;
    }

    // Must have an author profile
    if (!author) {
      setShowAuthorModal(true);
      return;
    }

    // Publish
    doPublish();
  }, [isAuthenticated, author, doPublish]);

  const handleAuthorCreated = useCallback(() => {
    setShowAuthorModal(false);
    doPublish();
  }, [doPublish]);

  if (!crux) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        loading={publishing}
        className="gap-1.5 h-7 px-2.5 text-xs bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 hover:text-accent"
      >
        <UploadIcon size={14} />
        Share
      </Button>

      <CreateAuthorModal
        open={showAuthorModal}
        onClose={() => setShowAuthorModal(false)}
        onCreated={handleAuthorCreated}
      />

      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        url={publishedUrl}
      />
    </>
  );
}
