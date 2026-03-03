import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import PaneHeader from './PaneHeader';
import MetadataContent from './MetadataContent';

function TagIcon() {
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
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

export default function MetadataPane() {
  const crux = useCruxStore((s) => s.crux);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const summary = useCruxStore((s) => s.summary);
  const messages = useCruxStore((s) => s.messages);
  const artifacts = useCruxStore((s) => s.artifacts);
  const author = useAuthStore((s) => s.author);
  const activeTabId = useUIStore((s) => s.editor.activeTabId);

  const selectedArtifact = activeTabId ? artifacts.find((a) => a.id === activeTabId) : null;

  if (!crux) {
    return (
      <div className="flex flex-col h-full">
        <PaneHeader paneType="details" icon={<TagIcon />} label="Metadata" />
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">No crux loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="details" icon={<TagIcon />} label="Metadata" />
      <MetadataContent
        crux={crux}
        summary={summary}
        selectedArtifact={selectedArtifact}
        authorName={author?.displayName || author?.username}
        messages={messages}
        onUpdate={updateCrux}
      />
    </div>
  );
}
