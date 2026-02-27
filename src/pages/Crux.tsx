import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { WorkspaceLayout } from '@/components/workspace';
import { Spinner } from '@/components/ui';

export default function Crux() {
  const { id } = useParams<{ id: string }>();
  const { crux, loadCrux, reset, artifacts } = useCruxStore();
  const { paneVisibility, setPaneVisible, setActiveCrux } = useUIStore();

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

  // Auto-show workshop pane when artifacts appear
  useEffect(() => {
    if (artifacts.length > 0 && !paneVisibility.artifacts && !paneVisibility.workshop) {
      setPaneVisible('artifacts', true);
      setPaneVisible('workshop', true);
    }
  }, [artifacts.length, paneVisibility.artifacts, paneVisibility.workshop, setPaneVisible]);

  if (!crux) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  return <WorkspaceLayout />;
}
