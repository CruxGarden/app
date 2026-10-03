import RecentWorkspaces from './RecentWorkspaces';
import { installToolFile } from '@/services/crux-tools/files';
import { installMoodFile, installImportedCreation } from '@/services/import-installation';
import { onUiRequest, takeUiRequest } from '@/lib/ui-requests';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import {
  useGardenContext,
  captureGardenId,
  cruxPath,
  gardenPath,
  inGarden,
} from '@/stores/gardenContext';
import { getServices } from '@/services';
import { PaneEmpty } from '@/components/workspace/pane-ui';
import { alertDialog, choiceDialog } from '@/stores/dialogStore';
import { toast } from '@/stores/toastStore';
import GardenActions from '@/components/garden/GardenActions';
import GardenBrief from '@/components/garden/GardenBrief';
import { importGardenPackage } from '@/services/garden-package';
import { Capability, can } from '@/lib/platform';
import { useTendingRows } from '@/stores/tendingStore';
import { startFromFiles, filesFromDataTransfer } from '@/services/file-routing';
import { importCrux } from '@/services/crux-io';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useGarden } from '@/hooks/useGarden';
import { useGardenStore } from '@/stores/gardenStore';

import { APP_NAME } from '@/lib/constants';
import { GardenGrid, GardenSearch } from '@/components/garden';
import NewCruxModal from '@/components/garden/NewCruxModal';
import RecoverSection from '@/components/garden/RecoverSection';
import TrashSection from '@/components/garden/TrashSection';
import Cruxspaces from '@/components/garden/Cruxspaces';
import Gardens from '@/components/garden/Gardens';
import { TRASH_RETENTION_DAYS } from '@/stores/gardenStore';
import LocalTestGarden from './LocalTestGarden';
import { openGardenPage } from '@/lib/public-url';
import {
  IconButton,
  Button,
  PlasmaButton,
  Spinner,
  Panel,
  SegmentedControl,
} from '@/components/ui';
import { GlobeIcon, PlusIcon } from '@/components/ui/icons';
import { useAuthStore } from '@/stores/authStore';
import * as cruxesApi from '@/api/cruxes';

export default function HomeGarden() {
  const aiEnabled = useAiEnabled();
  const garden = useGardenContext((s) => s.garden);
  const isHome = useGardenContext((s) => !s.garden || s.garden.id === s.root?.id);
  const loadError = useGardenStore((s) => s.error);
  const author = useAppStore((s) => s.author);
  const avatarUrl = useAvatarUrl(author);
  const {
    cruxList,
    loading,
    search,
    sortBy,
    setSearch,
    setSortBy,
    handleClearSearch,
    deleteCrux,
    refresh,
  } = useGarden();
  const navigate = useMoodNavigate();
  const emptyGarden = cruxList.length === 0 && search.length === 0;

  const tendingRows = useTendingRows();
  const tendingCounts: Record<string, number> = {};
  for (const row of tendingRows)
    if (row.state.attention.length)
      tendingCounts[row.cruxId] = (tendingCounts[row.cruxId] ?? 0) + 1;

  const thumbnails = useGardenStore((s) => s.thumbnails);
  const [showNewCrux, setShowNewCrux] = useState(false);
  const [newCruxView, setNewCruxView] = useState<'crux' | 'undertakings'>('crux');
  // "New Crux…" from the command palette lands here.
  useEffect(() => {
    const answer = () => {
      if (!takeUiRequest('new-crux')) return;
      setNewCruxView('crux');
      setShowNewCrux(true);
    };
    answer();
    return onUiRequest('new-crux', answer);
  }, []);
  const [dropping, setDropping] = useState(false);
  const [dropNotice, setDropNotice] = useState('');
  const handleDropFiles = useCallback(
    async (dt: DataTransfer) => {
      const origin = window.location.href;
      const gardenId = captureGardenId();
      setDropNotice('');
      try {
        const single = dt.files.length === 1 ? dt.files[0]! : null;
        if (single && /\.(cruxtool|cruxmood)$/i.test(single.name)) {
          const isTool = /\.cruxtool$/i.test(single.name);
          const item = isTool
            ? await installToolFile(single)
            : await installMoodFile(single, gardenId);
          refresh();
          setDropNotice(
            isTool
              ? 'Tool installed. Open Add Crux to create with it.'
              : `Mood installed: ${'name' in item ? item.name : ''}. Open Moods to preview it.`,
          );
          return;
        }
        if (single && /\.crux$/i.test(single.name)) {
          setDropNotice(`Importing ${single.name}…`);
          const result = await importCrux({ data: single, mode: 'clone', gardenId });
          const installed = await installImportedCreation(result.cruxId, gardenId);
          if (installed) {
            refresh();
            setDropNotice(
              `${installed.name} installed. Open ${installed.kind === 'tool' ? 'Add Crux' : 'Moods'} to use it.`,
            );
            return;
          }
          const imported = await getServices().crux.findById(result.cruxId);
          refresh();
          if (window.location.href === origin) navigate(cruxPath(imported, gardenId));
          return;
        }
        if (single && /\.cruxspace$/i.test(single.name) && gardenId) {
          setDropNotice(`Importing ${single.name}…`);
          const id = await importGardenPackage(single, gardenId);
          refresh();
          setDropNotice('');
          if (window.location.href === origin) navigate(gardenPath(id));
          return;
        }
        const { files, folder } = await filesFromDataTransfer(dt);
        setDropNotice(`Starting from ${folder ?? files[0]?.path ?? 'the drop'}…`);
        const { cruxId } = await startFromFiles(files, folder, gardenId);
        if (window.location.href === origin) navigate(inGarden(`/c/${cruxId}`, gardenId));
      } catch (err) {
        setDropNotice(err instanceof Error ? err.message : 'Could not start from that drop.');
      }
    },
    [navigate, refresh],
  );

  // A published crux deleted here would keep serving with nothing left to manage it
  // (RESILIENCE-PLAN §3 scenario 3): offer to take it offline in the same breath.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const confirmDelete = useCallback(
    async (id: string) => {
      const crux = cruxList.find((c) => c.id === id);
      const published = !!crux?.meta?.publishedAt && isAuthenticated;
      const isGarden = crux?.kind === 'garden';
      // A Garden's members are not deleted with it: they move up to this Garden.
      const members = isGarden
        ? await (await import('@/services/garden-navigation')).gardenMembers(id).catch(() => [])
        : [];
      // Nothing to decide: it goes to Recently deleted at once, and the note
      // that says so offers the way back (a question only when there is one).
      if (!published && !members.length) {
        const name = crux?.title || (isGarden ? 'the Garden' : 'the Crux');
        try {
          await deleteCrux(id);
          toast(`Moved ${name} to Recently deleted`, {
            action: { label: 'Undo', run: () => useGardenStore.getState().restoreCrux(id) },
          });
        } catch (error) {
          await alertDialog(
            (error as Error).message,
            isGarden ? 'Could not delete the Garden' : 'Could not delete the Crux',
          );
        }
        return;
      }
      const { choice, checked } = await choiceDialog({
        title: isGarden ? 'Delete Garden' : 'Delete Crux',
        message: isGarden
          ? `Delete ${crux?.title || 'this Garden'}? It moves to Recently deleted, where you can restore it for ${TRASH_RETENTION_DAYS} days.${
              members.length
                ? ` Its ${members.length === 1 ? 'Crux moves' : `${members.length} Cruxes move`} to ${garden?.title || 'this Garden'} first, so nothing is lost.`
                : ''
            }`
          : `Delete ${crux?.title || 'this crux'}? It moves to Recently deleted, where you can restore it for ${TRASH_RETENTION_DAYS} days. Its files stay in its Project Folder on disk.`,
        choices: [
          { id: 'cancel', label: 'Cancel', variant: 'ghost' },
          { id: 'delete', label: 'Delete', variant: 'danger' },
        ],
        checkbox: published
          ? {
              label:
                'Also take it offline. Untick to keep the published site up — it will then be listed under “In your account, not on this machine”, where you can recover or unshare it.',
              checked: true,
            }
          : undefined,
      });
      if (choice !== 'delete') return;
      try {
        if (isGarden && members.length) {
          const { getSqliteClient } = await import('@/services/sqlite/client');
          const membership = getSqliteClient().gardenMembership;
          const parentId = garden?.id;
          if (!membership || !parentId) throw new Error('This Garden’s Cruxes could not be moved.');
          for (const member of members)
            await membership.move({
              gardenId: parentId,
              memberId: member.id,
              expectedParents: [id],
            });
        }
        if (published && checked) await cruxesApi.unpublish(id);
        await deleteCrux(id);
      } catch (error) {
        await alertDialog(
          (error as Error).message,
          isGarden ? 'Could not delete the Garden' : 'Could not delete the Crux',
        );
      }
    },
    [cruxList, deleteCrux, isAuthenticated, garden?.id, garden?.title],
  );

  // Page title
  useEffect(() => {
    document.title = garden?.title || (author ? author.username : 'Garden');
    return () => {
      document.title = APP_NAME;
    };
  }, [author, garden?.title]);

  if (loading)
    return <PaneEmpty icon={<Spinner size={16} />} title="Opening Garden…" className="h-full" />;
  if (loadError)
    return (
      <PaneEmpty title="The Garden could not open" description={loadError} className="h-full">
        <Button size="sm" variant="secondary" onClick={() => void refresh()}>
          Retry
        </Button>
      </PaneEmpty>
    );

  return (
    <div
      className="p-4 sm:p-6 max-w-5xl mx-auto"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(false);
        void handleDropFiles(e.dataTransfer);
      }}
      data-dropping={dropping || undefined}
      data-testid="home-drop"
    >
      {/* Header + Search panel */}
      <Panel padding="sm" className="sm:p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {author && (
              <div className="w-12 h-12 rounded-[var(--radius)] overflow-hidden flex items-center justify-center shrink-0 bg-accent-muted ring-1 ring-text-muted/(--tint-subtle)">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={author.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-accent">
                    {author.username?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                )}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-lg font-medium text-text truncate">
                {garden?.title || (author ? author.username : 'Garden')}
              </h1>
              {garden && <GardenBrief key={garden.id} gardenId={garden.id} />}
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-text-muted">{isHome ? 'Home Garden' : 'Garden'}</p>
                {can(Capability.LocalStaging) && <LocalTestGarden />}
                {author && (
                  <IconButton
                    label="Public Garden on crux.garden"
                    size="sm"
                    tooltip={{ label: 'Public Garden on crux.garden' }}
                    onClick={() => void openGardenPage(`/${author.username}`)}
                  >
                    <GlobeIcon />
                  </IconButton>
                )}
              </div>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowNewCrux(true)}>
            <PlusIcon size={15} />
            Add Crux
          </Button>
        </div>
        {(dropping || dropNotice) && (
          <p role="status" className="text-xs text-text-muted mt-2">
            {dropping ? 'Drop a file or folder to start a Crux from it.' : dropNotice}
          </p>
        )}
        {!emptyGarden && (
          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1">
              <GardenSearch value={search} onChange={setSearch} />
            </div>
            <SegmentedControl
              label="Sort by"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'created', label: 'Created' },
                { value: 'updated', label: 'Updated' },
              ]}
              className="h-9 shrink-0"
            />
          </div>
        )}
      </Panel>

      {/* Cruxes the account has and this machine does not (RESILIENCE-PLAN §2c) */}
      <RecoverSection />

      {garden && !emptyGarden && <GardenActions key={`actions:${garden.id}`} />}
      {can(Capability.V2) && (
        <details className="mb-4 text-sm text-text-muted">
          <summary className="py-2 hover:text-text">Shared gardens</summary>
          <Gardens />
        </details>
      )}

      {!search && <RecentWorkspaces />}

      {/* Content */}
      {cruxList.length === 0 && search.length > 0 ? (
        <Panel padding="md" className="flex flex-col items-center py-10">
          <p className="text-sm text-text-muted mb-3">No cruxes match your search</p>
          <Button variant="ghost" size="sm" onClick={handleClearSearch}>
            Clear search
          </Button>
        </Panel>
      ) : cruxList.length === 0 ? (
        <Panel padding="md" className="flex flex-col items-center text-center py-6 px-4">
          <div className="w-12 h-12 rounded-full bg-accent-muted text-accent flex items-center justify-center mb-4">
            <PlusIcon size={20} />
          </div>
          <h2 className="font-display text-base text-text mb-1">What do you want to make?</h2>
          <p className="text-sm text-text-muted max-w-[34ch] mb-5">
            Make a page, drawing, song or notebook. Start one project, or explore a guided
            collection.
            {aiEnabled && ' Work on your own or with a collaborator.'}
          </p>
          <PlasmaButton
            className="h-auto min-h-11 max-w-full whitespace-normal py-2"
            onClick={() => {
              setNewCruxView('crux');
              setShowNewCrux(true);
            }}
          >
            Just a Crux — one project
          </PlasmaButton>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setNewCruxView('undertakings');
              setShowNewCrux(true);
            }}
          >
            Explore undertakings — a collection of projects
          </Button>
        </Panel>
      ) : (
        <GardenGrid
          cruxes={cruxList}
          onDelete={(id) => void confirmDelete(id)}
          sortBy={sortBy}
          thumbnails={thumbnails}
          tendingCounts={tendingCounts}
        />
      )}

      {garden && emptyGarden && <GardenActions key={`actions:${garden.id}`} />}

      {/* The Garden's shared work: walkthrough, outputs, history, package */}
      {garden && <Cruxspaces key={`outputs:${garden.id}`} gardenId={garden.id} />}

      {/* The Trash: deleted cruxes wait here, restorable, until purged */}
      <TrashSection />

      {/* New crux modal */}
      <NewCruxModal
        open={showNewCrux}
        initialView={newCruxView}
        onClose={() => {
          setShowNewCrux(false);
          setNewCruxView('crux');
        }}
      />
    </div>
  );
}
