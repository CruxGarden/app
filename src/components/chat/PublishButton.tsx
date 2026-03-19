import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCruxStore } from '@/stores/cruxStore';
import { Button } from '@/components/ui';
import CreateAuthorModal from '@/components/auth/CreateAuthorModal';
import PublishModal from './PublishModal';

const REDIRECT_KEY = 'cruxgarden:publishRedirect';

function PublishIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export default function PublishButton() {
  const navigate = useNavigate();
  const { isAuthenticated, author } = useAuthStore();
  const { crux, publishCrux } = useCruxStore();
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [publishing, setPublishing] = useState(false);

  const doPublish = useCallback(async () => {
    if (!crux) return;
    const currentAuthor = useAuthStore.getState().author;
    if (!currentAuthor) return;

    setPublishing(true);
    try {
      await publishCrux();
      const url = `${window.location.origin}/${currentAuthor.username}/${crux.slug}`;
      setPublishedUrl(url);
      setShowPublishModal(true);
    } catch {
      // TODO: show error toast
    } finally {
      setPublishing(false);
    }
  }, [crux, publishCrux]);

  const handleClick = useCallback(() => {
    // Step 1: Must be logged in
    if (!isAuthenticated) {
      sessionStorage.setItem(REDIRECT_KEY, window.location.pathname);
      navigate('/login');
      return;
    }

    // Step 2: Must have an author profile
    if (!author) {
      setShowAuthorModal(true);
      return;
    }

    // Step 3: Publish
    doPublish();
  }, [isAuthenticated, author, doPublish, navigate]);

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
        <PublishIcon />
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
