import { useCruxStore } from '@/stores/cruxStore';
import { useAppStore } from '@/stores/appStore';
import MetadataContent from './MetadataContent';
import { PaneEmpty } from './pane-ui';

export default function MetadataPane() {
  const crux = useCruxStore((s) => s.crux);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const summary = useCruxStore((s) => s.summary);
  const messages = useCruxStore((s) => s.messages);
  const author = useAppStore((s) => s.author);

  if (!crux) {
    return (
      <div className="flex flex-col h-full">
        <PaneEmpty title="No crux loaded" />
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
