import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import MetadataContent from './MetadataContent';

export default function MetadataPane() {
  const crux = useCruxStore((s) => s.crux);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const summary = useCruxStore((s) => s.summary);
  const messages = useCruxStore((s) => s.messages);
  const author = useAuthStore((s) => s.author);

  if (!crux) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">No crux loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <MetadataContent
        crux={crux}
        summary={summary}
        authorName={author?.displayName || author?.username}
        messages={messages}
        onUpdate={updateCrux}
      />
    </div>
  );
}
