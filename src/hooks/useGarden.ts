import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGardenStore } from '@/stores/gardenStore';
import { useCruxStore } from '@/stores/cruxStore';

export function useGarden() {
  const {
    cruxList,
    loading,
    search,
    pagination,
    load,
    setSearch,
    setPage,
  } = useGardenStore();

  const createCrux = useCruxStore((s) => s.createCrux);
  const navigate = useNavigate();

  // Load on mount
  useEffect(() => {
    load();
  }, [load]);

  const handleNewCrux = async () => {
    const crux = await createCrux();
    navigate(`/crux/${crux.id}`);
  };

  const handleClearSearch = () => {
    setSearch('');
  };

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  const goToPage = (page: number) => {
    const offset = (page - 1) * pagination.limit;
    setPage(offset);
  };

  return {
    cruxList,
    loading,
    search,
    pagination,
    totalPages,
    currentPage,
    setSearch,
    goToPage,
    handleNewCrux,
    handleClearSearch,
    refresh: load,
  };
}
