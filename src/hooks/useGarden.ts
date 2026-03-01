import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGardenStore } from '@/stores/gardenStore';
import { useCruxStore } from '@/stores/cruxStore';
import { cruxes } from '@/api';

export function useGarden() {
  const { cruxList, loading, search, sortBy, pagination, load, setSearch, setSortBy, setPage } =
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

  // When searching client-side, base pagination on filtered results
  const effectiveTotal = search ? cruxList.length : pagination.total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pagination.limit));
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  const goToPage = (page: number) => {
    const offset = (page - 1) * pagination.limit;
    setPage(offset);
  };

  const deleteCrux = useCallback(
    async (id: string) => {
      await cruxes.remove(id);
      load();
    },
    [load],
  );

  return {
    cruxList,
    loading,
    search,
    sortBy,
    pagination,
    totalPages,
    currentPage,
    setSearch,
    setSortBy,
    goToPage,
    handleNewCrux,
    handleClearSearch,
    deleteCrux,
    refresh: load,
  };
}
