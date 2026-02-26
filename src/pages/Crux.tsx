import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { useGates } from '@/hooks/useGates';
import { cn } from '@/lib/cn';
import { ChatPanel } from '@/components/chat';
import { FileViewer } from '@/components/artifacts';
import { GateTimeline } from '@/components/gates';
import { Spinner } from '@/components/ui';

export default function Crux() {
  const { id } = useParams<{ id: string }>();
  const { crux, loadCrux, reset, artifacts } = useCruxStore();
  const { fileViewerOpen, setFileViewer, timelineOpen, setTimeline } = useUIStore();
  const { gates, gateCount, isCreatingGate, summary } = useGates();

  useEffect(() => {
    if (id) loadCrux(id);
    return () => reset();
  }, [id, loadCrux, reset]);

  // Auto-show file viewer when artifacts appear
  useEffect(() => {
    if (artifacts.length > 0 && !fileViewerOpen) {
      setFileViewer(true);
    }
  }, [artifacts.length, fileViewerOpen, setFileViewer]);

  // Auto-show timeline when first gate is created
  useEffect(() => {
    if (gateCount > 0 && !timelineOpen) {
      setTimeline(true);
    }
  }, [gateCount, timelineOpen, setTimeline]);

  if (!crux) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Gate Timeline — left panel (hidden on mobile) */}
      {timelineOpen && (
        <div
          className={cn(
            'hidden md:flex',
            'w-72 border-r border-border bg-surface/30 backdrop-blur-[var(--glass-blur)]',
            'flex-col min-h-0',
          )}
        >
          <GateTimeline
            gates={gates}
            gateCount={gateCount}
            summary={summary}
            isCreatingGate={isCreatingGate}
          />
        </div>
      )}

      {/* Chat — center panel */}
      <div className="flex-1 min-w-0">
        <ChatPanel />
      </div>

      {/* File Viewer — right panel (hidden on mobile) */}
      {fileViewerOpen && (
        <div
          className={cn(
            'hidden md:flex',
            'w-80 border-l border-border bg-surface/30 backdrop-blur-[var(--glass-blur)]',
            'flex-col min-h-0',
          )}
        >
          <FileViewer />
        </div>
      )}
    </div>
  );
}
