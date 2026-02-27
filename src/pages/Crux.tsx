import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { useGates } from '@/hooks/useGates';
import { WorkspaceLayout } from '@/components/workspace';
import { Spinner } from '@/components/ui';

export default function Crux() {
  const { id } = useParams<{ id: string }>();
  const { crux, loadCrux, reset, artifacts } = useCruxStore();
  const { paneVisibility, setPaneVisible, setActiveCrux } = useUIStore();
  const { gateCount } = useGates();

  useEffect(() => {
    if (id) {
      loadCrux(id);
      setActiveCrux(id);
    }
    return () => {
      reset();
      setActiveCrux(null);
    };
  }, [id, loadCrux, reset, setActiveCrux]);

  // Auto-show editor pane when artifacts appear
  useEffect(() => {
    if (artifacts.length > 0 && !paneVisibility.artifacts && !paneVisibility.editor) {
      setPaneVisible('artifacts', true);
      setPaneVisible('editor', true);
    }
  }, [artifacts.length, paneVisibility.artifacts, paneVisibility.editor, setPaneVisible]);

  // Auto-show navigation when first gate is created
  useEffect(() => {
    if (gateCount > 0 && !paneVisibility.navigation) {
      setPaneVisible('navigation', true);
    }
  }, [gateCount, paneVisibility.navigation, setPaneVisible]);

  if (!crux) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  return <WorkspaceLayout />;
}
