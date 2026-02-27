import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGarden } from '@/hooks/useGarden';
import { GardenGrid, GardenSearch, GardenEmpty } from '@/components/garden';
import { Button, Spinner, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';

export default function Garden() {
  const author = useAuthStore((s) => s.author);
  const {
    cruxList,
    loading,
    search,
    totalPages,
    currentPage,
    setSearch,
    goToPage,
    handleNewCrux,
    handleClearSearch,
    deleteCrux,
  } = useGarden();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingCrux = deletingId ? cruxList.find((c) => c.id === deletingId) : null;

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingId) return;
    await deleteCrux(deletingId);
    setDeletingId(null);
  }, [deletingId, deleteCrux]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-text truncate">
            {author ? `@${author.username}` : 'Garden'}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Your cruxes and creative history
          </p>
        </div>
        <Button onClick={handleNewCrux}>New Crux</Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <GardenSearch value={search} onChange={setSearch} />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      ) : cruxList.length === 0 ? (
        <GardenEmpty
          hasSearch={search.length > 0}
          onNewCrux={handleNewCrux}
          onClearSearch={handleClearSearch}
        />
      ) : (
        <>
          <GardenGrid cruxes={cruxList} onDelete={setDeletingId} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Prev
              </button>
              <span className="text-xs font-mono text-text-muted">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)}>
        <h2 className="font-display text-sm font-medium text-text mb-2">
          Delete crux
        </h2>
        <p className="text-xs text-text-muted mb-4">
          Are you sure you want to delete <span className="text-text font-medium">{deletingCrux?.title || 'this crux'}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setDeletingId(null)}
            className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDelete}
            className={cn(
              'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
              'bg-error text-bg hover:brightness-110 transition-all cursor-pointer',
            )}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
