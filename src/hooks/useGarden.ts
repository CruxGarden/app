import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGardenStore } from '@/stores/gardenStore';
import { useCruxStore } from '@/stores/cruxStore';
import { useShallow } from 'zustand/react/shallow';

export function useGarden() {
  const { cruxList, loading, search, sortBy, load, setSearch, setSortBy } = useGardenStore(
    useShallow((s) => ({
      cruxList: s.cruxList,
      loading: s.loading,
      search: s.search,
      sortBy: s.sortBy,
      load: s.load,
      setSearch: s.setSearch,
      setSortBy: s.setSortBy,
    })),
  );

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

  const deleteCrux = useGardenStore((s) => s.deleteCrux);

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
