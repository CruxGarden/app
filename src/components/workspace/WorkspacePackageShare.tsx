import { useEffect, useId, useRef, useState } from 'react';
import type { Crux } from '@/api/types';
import { Button, Select } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import { getServices } from '@/services';
import { exportCrux, type ExportResult } from '@/services/crux-io';
import { exportCruxspace } from '@/services/cruxspace-package';
import { CRUXSPACES_CHANGED, listCruxspaces, type Cruxspace } from '@/services/cruxspaces';
import { confirmDialog } from '@/stores/dialogStore';
import { PaneAction, PaneSection } from './pane-ui';

type PackageChoice = Cruxspace & { memberNames: string[] };

/** Developer workspaces travel as explicit editable files, with their archive scope visible. */
export default function WorkspacePackageShare({ crux }: { crux: Crux }) {
  const [choices, setChoices] = useState<PackageChoice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const operation = useRef(false);
  const fieldId = useId();
  const selected = choices.find((choice) => choice.id === selectedId);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setSelectedId('');
    void listCruxspaces()
      .then(async (spaces) => {
        const containing = spaces.filter((space) => space.cruxIds.includes(crux.id));
        return Promise.all(
          containing.map(async (space) => ({
            ...space,
            memberNames: await Promise.all(
              space.cruxIds.map(async (id) => {
                const member = await getServices().crux.findById(id);
                return member.title || member.slug || 'Untitled Crux';
              }),
            ),
          })),
        );
      })
      .then((next) => {
        if (current) setChoices(next);
      })
      .catch((cause: unknown) => {
        if (current) {
          setChoices([]);
          setError(cause instanceof Error ? cause.message : 'Could not load Garden members.');
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(CRUXSPACES_CHANGED, refresh);
    return () => {
      current = false;
      window.removeEventListener(CRUXSPACES_CHANGED, refresh);
    };
  }, [crux.id, revision]);

  const exportPackage = async (garden?: PackageChoice) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    const title = garden?.name ?? crux.title ?? 'Untitled Crux';
    try {
      const approved = await confirmDialog({
        title: garden ? `Export ${title}` : 'Export this Crux',
        message: garden
          ? `This editable Garden package includes ${garden.memberNames.join(', ')}, with their files, Collaboration, Tasks and Growth, plus the Garden’s Collaboration and schedules. Anyone you give the file can read them. Saved secrets and local folder permissions are excluded. Review the content before passing it on.`
          : `This editable file includes ${title} with its files, Collaboration, Tasks and Growth. Other Cruxes in its workspace are not included. Anyone you give the file can read its content. Saved secrets and local folder permissions are excluded.`,
        confirmLabel: garden ? 'Export Garden package' : 'Export Crux file',
      });
      if (!approved) return;
      let result: ExportResult;
      let unavailable: string[] = [];
      if (garden) {
        const exported = await exportCruxspace({
          spaceId: garden.id,
          expectedMemberIds: garden.cruxIds,
          onProgress: setStatus,
        });
        result = exported;
        unavailable = exported.manifest.unavailable;
      } else {
        result = await exportCrux({ cruxId: crux.id, onProgress: setStatus });
      }
      if (result.failed.length || unavailable.length)
        throw new Error(
          `The package is incomplete: ${[...result.failed, ...unavailable].join(', ')}. No file was downloaded. Refresh the Garden list, resolve missing items and retry.`,
        );
      downloadBlob(result.blob, result.filename);
      setStatus(`Exported ${result.filename}. The recipient can import it into their Garden.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The export failed. Please retry.');
      setStatus('');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full overflow-y-auto p-3 text-text">
      <PaneSection label="Share a workspace">
        <h2 className="text-sm text-heading font-body">An editable Garden package</h2>
        <p className="text-xs text-text-muted leading-relaxed mt-2">
          Export the Garden containing your Stack, Runner and Link Cruxes, then give the file to
          your team. They import it, choose their own folders and add their secrets before starting
          services.
        </p>
        <p className="text-xs text-text-muted leading-relaxed mt-2">
          This saves a file on your device. Online workspace publication is not available.
        </p>
      </PaneSection>
      <PaneSection label="Choose the Garden to export">
        {loading ? (
          <p role="status" className="text-xs text-text-muted">
            Loading Garden members…
          </p>
        ) : choices.length ? (
          <>
            <label htmlFor={fieldId} className="block text-xs text-text-muted mb-2">
              Garden
            </label>
            <Select
              id={fieldId}
              value={selectedId}
              disabled={busy}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setStatus('');
              }}
            >
              <option value="">Choose a Garden…</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </Select>
            {selected && (
              <div className="mt-3 text-xs">
                <p className="text-heading">Includes {selected.memberNames.length} Cruxes</p>
                <ul className="list-disc pl-4 mt-1 space-y-1 text-text-muted">
                  {selected.cruxIds.map((id, index) => (
                    <li key={id}>{selected.memberNames[index]}</li>
                  ))}
                </ul>
                <p className="text-text-muted mt-3 leading-relaxed">
                  The package includes member files, Collaboration, Tasks and Growth, plus the
                  Garden’s Collaboration and schedules. Review private content before giving it to
                  anyone.
                </p>
              </div>
            )}
            <PaneAction
              className="mt-3"
              disabled={!selected || busy}
              onClick={() => void exportPackage(selected)}
            >
              Export Garden package
            </PaneAction>
          </>
        ) : (
          <p className="text-xs text-text-muted">
            This Crux is not in an exportable Garden. Add it to a Garden with the related Cruxes to
            hand over the whole workspace.
          </p>
        )}
        <Button
          variant="ghost"
          size="xs"
          className="mt-2"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh Garden list
        </Button>
      </PaneSection>
      <PaneSection label="Only this Crux">
        <p className="text-xs text-text-muted mb-3 leading-relaxed">
          Export {crux.title || 'this Crux'} and its saved history. Related Cruxes must be handed
          over separately.
        </p>
        <PaneAction tone="secondary" disabled={busy} onClick={() => void exportPackage()}>
          Export this Crux
        </PaneAction>
      </PaneSection>
      {status && (
        <p role="status" className="text-xs text-text-muted">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
