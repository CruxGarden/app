import RecoverySettings from './RecoverySettings';
import ActionError from '@/components/ui/ActionError';
import { actionFailure, type ActionFailure } from '@/lib/action-failure';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import PrivateBackupDescription from '@/components/garden/PrivateBackupDescription';
import SettingsSection from './SettingsSection';
import { downloadBlob } from '@/lib/download';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { exportGarden, confirmAndImportGarden, wipeGarden } from '@/services/garden-io';
import { Button } from '@/components/ui';
import { choiceDialog } from '@/stores/dialogStore';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { getGardenRoot, chooseGardenRoot, shortenHomePath } from '@/services/desktop';
import { openSetupAgain } from '@/components/setup/setup-store';

const WIPE_CONFIRMATION = 'delete me';
/** An export this recent counts as "you have a copy" — the wipe skips the offer. */
const RECENT_EXPORT_MS = 10 * 60 * 1000;
/** When the garden was last exported in this session — survives Settings closing and reopening. */
let lastGardenExportAt = 0;

export default function DataSettings() {
  const aiEnabled = useAiEnabled();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<ActionFailure | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const desktop = can(Capability.ProjectFolder);
  const [gardenRoot, setGardenRoot] = useState<string | null>(null);

  useEffect(() => {
    if (desktop) getGardenRoot().then(setGardenRoot);
  }, [desktop]);

  const handleChooseGardenRoot = useCallback(async () => {
    const chosen = await chooseGardenRoot();
    if (chosen) setGardenRoot(chosen);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const result = await exportGarden({
        onProgress: setStatus,
      });

      downloadBlob(result.blob, result.filename);

      setStatus('Export complete');
      lastGardenExportAt = Date.now();
      return true;
    } catch (err) {
      console.error('Garden export failed:', err);
      setError(
        actionFailure(
          err,
          'Could not export the Garden. Check the details, then retry Export garden.',
        ),
      );
      setStatus('');
      return false;
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    try {
      const imported = await confirmAndImportGarden({
        data: file,
        onProgress: setStatus,
        onPostImport: async () => {
          await useAppStore.getState().ensureAuthor();
        },
      });

      if (!imported) {
        setStatus('');
      }
    } catch (err) {
      console.error('Garden import failed:', err);
      setError(
        actionFailure(
          err,
          'Import could not finish. Check what was added before retrying; keep your original backup file.',
        ),
      );
      setStatus('');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }, []);

  const handleWipe = useCallback(async () => {
    // Guardrail: a wipe with no copy anywhere is the one thing nobody can undo.
    // Unless a .garden export just happened, offer to make one on the way out.
    if (Date.now() - lastGardenExportAt > RECENT_EXPORT_MS) {
      const { choice } = await choiceDialog({
        title: 'Wipe the garden',
        message: `Every crux, ${aiEnabled ? 'file, conversation' : 'file'} and setting on this machine goes. A .garden file is the only way back — unless this garden is backed up at crux.garden.`,
        choices: [
          { id: 'wipe', label: 'Wipe without a copy', variant: 'danger' },
          { id: 'export', label: 'Export, then wipe', variant: 'primary' },
        ],
      });
      if (!choice) return;
      if (choice === 'export' && !(await handleExport())) return;
    }
    setWiping(true);
    setError(null);
    try {
      await wipeGarden(setStatus);
      setWipeConfirm('');
      setStatus('Garden wiped — redirecting...');
      setTimeout(() => {
        window.location.href = '/';
      }, 600);
    } catch (err) {
      console.error('Garden wipe failed:', err);
      // ADR 0018: open workspaces must be closed first — say so, not just "failed"
      setError(
        actionFailure(
          err,
          err instanceof Error && /open Crux workspaces/.test(err.message)
            ? err.message
            : 'Wipe could not finish. Check the Garden and the details before retrying.',
        ),
      );
      setStatus('');
    } finally {
      setWiping(false);
    }
  }, [handleExport, aiEnabled]);

  const busy = exporting || importing || wiping;

  return (
    <SettingsSection title="Garden" collapsible>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-xs text-text-muted min-w-0 flex-1">
            Change your garden&rsquo;s name, collaborators and Mood step by step. Nothing is
            removed.
          </p>
          <Button variant="secondary" size="sm" onClick={openSetupAgain} disabled={busy}>
            Run setup again
          </Button>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Export or import your entire garden — all cruxes, files, conversations, and settings.
        </p>

        <div className="mb-4">
          <PrivateBackupDescription installation />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleExport()}
            disabled={busy}
            loading={exporting}
          >
            {exporting ? 'Exporting...' : 'Export garden'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => importRef.current?.click()}
            disabled={busy}
            loading={importing}
          >
            {importing ? 'Importing...' : 'Import garden'}
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".garden"
            className="hidden"
            onChange={handleImport}
          />
        </div>

        {desktop && (
          <>
            <hr className="divider my-6" />
            <h3 className="font-display text-sm font-medium text-text mb-2">Garden location</h3>
            <p className="text-xs text-text-muted mb-3">
              New cruxes create their project folders here. Existing folders stay where they are and
              keep working.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 text-xs font-mono rounded-[var(--radius-sm)] bg-surface-solid border border-border text-text truncate">
                {gardenRoot ? shortenHomePath(gardenRoot) : 'Loading…'}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleChooseGardenRoot}
                disabled={busy}
              >
                Choose…
              </Button>
            </div>
          </>
        )}

        <hr className="divider my-6" />

        {desktop && <RecoverySettings />}

        <h3 className="font-display text-sm font-medium text-error mb-2">Danger zone</h3>
        <p className="text-xs text-text-muted mb-3">
          Permanently delete all cruxes, files, {aiEnabled ? 'conversations, ' : ''}and settings.
          Type <span className="font-mono text-text">"{WIPE_CONFIRMATION}"</span> to confirm.
        </p>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={wipeConfirm}
            onChange={(e) => setWipeConfirm(e.target.value)}
            placeholder={WIPE_CONFIRMATION}
            disabled={busy}
            className={cn(
              'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)] w-32',
              'bg-surface border border-border text-text placeholder:text-text-muted',
              'focus:outline-none focus:border-error',
            )}
          />
          <Button
            variant="danger"
            size="sm"
            onClick={handleWipe}
            disabled={busy || wipeConfirm !== WIPE_CONFIRMATION}
            loading={wiping}
          >
            Wipe garden
          </Button>
        </div>

        {status && <p className="text-xs font-mono text-text-muted mt-2">{status}</p>}
        <ActionError failure={error} />
      </div>
    </SettingsSection>
  );
}
