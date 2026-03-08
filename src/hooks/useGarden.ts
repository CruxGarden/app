import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGardenStore } from '@/stores/gardenStore';
import { useCruxStore } from '@/stores/cruxStore';
import { getServices } from '@/services';

export function useGarden() {
  const { cruxList, loading, search, sortBy, load, setSearch, setSortBy } =
    useGardenStore();

  const createCrux = useCruxStore((s) => s.createCrux);
  const navigate = useNavigate();

  // Load on mount
  useEffect(() => {
    load();
  }, [load]);

  const handleNewCrux = async () => {
    const crux = await createCrux();
    navigate(`/c/${crux.id}`);
  };

  const handleClearSearch = () => {
    setSearch('');
  };

  const deleteCrux = useCallback(
    async (id: string) => {
      const { crux: cruxService } = getServices();
      await cruxService.delete(id);
      load();
    },
    [load],
  );

  return {
    cruxList,
    loading,
    search,
    sortBy,
    setSearch,
    setSortBy,
    handleNewCrux,
    handleClearSearch,
    deleteCrux,
    refresh: load,
  };
}
