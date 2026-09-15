import { useEffect, useRef, useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui';
import { can, Capability } from '@/lib/platform';
import { pathOf } from '@/lib/artifact-path';
import {
  FIGMA_PROJECT_PATH,
  readFigmaProject,
  saveFigmaReference,
  importFigmaExport,
} from '@/services/figma';
import CruxspaceAssetsButton from './CruxspaceAssetsButton';

type Project = Awaited<ReturnType<typeof readFigmaProject>>;
/** Companion to the real app. This does not pretend a saved URL is an MCP connection. */
export default function FigmaPane() {
  const crux = useCruxStore((s) => s.crux)!;
  const artifacts = useCruxStore((s) => s.artifacts);
  const historical = useCruxStore((s) => !!s.viewingSnapshotId || !!s.crux?.meta?.workingCopy);
  const refresh = useCruxStore((s) => s.refreshArtifacts);
  const openFile = useWorkspaceUIStore((s) => s.openFile);
  const setView = useWorkspaceUIStore((s) => s.setWorkshopView);
  const currentFingerprint = artifacts.find((a) => pathOf(a) === FIGMA_PROJECT_PATH)?.fingerprint;
  const [project, setProject] = useState<Project | null>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [arranged, setArranged] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const owner = crux.id;
  const hasArrangement = can(Capability.FigmaWindowArrangement);
  const changed = !!project && project.fingerprint !== currentFingerprint;

  async function load() {
    const next = await readFigmaProject(owner);
    setProject(next);
    setUrl(next.reference?.url ?? '');
    setDirty(false);
  }
  useEffect(() => {
    let active = true;
    void readFigmaProject(owner)
      .then((next) => {
        if (!active || dirty) return;
        setProject(next);
        setUrl(next.reference?.url ?? '');
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [owner, currentFingerprint, dirty]);
  useEffect(() => {
    if (hasArrangement)
      void window
        .electronAPI!.figmaDesktop!.status()
        .then((s) => setArranged(s.arranged))
        .catch(() => {});
  }, [hasArrangement]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editBrief = () => {
    const brief = artifacts.find((a) => pathOf(a) === 'brief.md');
    if (brief) {
      openFile(brief.id, 'brief.md');
      setView('advanced');
    }
  };
  if (historical)
    return (
      <p className="p-5 text-sm">
        Return to Main and the current version to use the Figma companion. Saved references and
        exports are available in Artifacts.
      </p>
    );
  return (
    <div className="h-full min-h-0 overflow-auto p-5" data-testid="figma-companion">
      <div className="max-w-xl mx-auto space-y-5">
        <header className="space-y-2">
          <p className="text-xs text-text-muted">External app · Proof of concept</p>
          <h2 className="text-xl font-medium">Design together in Figma</h2>
          <p className="text-sm text-text-muted">
            Keep working on the canvas. Your brief, Collaboration and imported assets stay here.
          </p>
        </header>
        {historical && (
          <p role="status" className="text-sm">
            Return to Main and the current version to change the Figma reference or import assets.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-error break-words">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm break-words">
            {notice}
          </p>
        )}
        <section className="space-y-3" aria-label="Figma document">
          <label className="block text-sm" htmlFor="figma-document-link">
            Figma file or frame link
          </label>
          <input
            id="figma-document-link"
            className="w-full p-2 text-sm bg-surface-solid text-text border border-border rounded-[var(--radius-sm)]"
            value={url}
            disabled={busy || historical}
            placeholder="https://www.figma.com/design/…"
            onChange={(e) => {
              setDirty(true);
              setUrl(e.target.value);
            }}
          />
          {changed && (
            <p className="text-sm text-text-muted">
              The saved link changed elsewhere. Your draft is still above; reload before saving.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || historical || changed || !project || !url.trim()}
              onClick={() =>
                void act(async () => {
                  const next = await saveFigmaReference(owner, url, project!.fingerprint);
                  setDirty(false);
                  setProject(next);
                  setUrl(next.reference!.url);
                  await refresh();
                  setNotice('Figma link saved.');
                })
              }
            >
              Save link
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(load)}>
              Reload link
            </Button>
            <Button size="sm" variant="ghost" onClick={editBrief}>
              Edit brief
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasArrangement && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await window.electronAPI!.figmaDesktop!.open();
                  })
                }
              >
                Open Figma app
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={!project?.reference || busy || historical}
              onClick={() =>
                void act(async () => {
                  await window.electronAPI!.desktop.openWeb(project!.reference!.url);
                })
              }
            >
              Open linked design
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            The design link follows your Figma browser/desktop preference.
          </p>
        </section>
        {hasArrangement && (
          <section className="space-y-3" aria-label="Window arrangement">
            <h3 className="text-sm font-medium">Work side by side</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || arranged}
                onClick={() =>
                  void act(async () => {
                    const result = await window.electronAPI!.figmaDesktop!.arrange('left');
                    setArranged(result.arranged);
                  })
                }
              >
                Arrange beside Figma
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !arranged}
                onClick={() =>
                  void act(async () => {
                    try {
                      await window.electronAPI!.figmaDesktop!.restore();
                    } finally {
                      setArranged((await window.electronAPI!.figmaDesktop!.status()).arranged);
                    }
                  })
                }
              >
                Restore windows
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              On Mac, allow Accessibility and Automation when prompted. Use one Figma window outside
              full screen. You can also arrange both windows yourself.
            </p>
          </section>
        )}
        <section className="space-y-2" aria-label="Figma tool connection">
          <h3 className="text-sm font-medium">Agent connection</h3>
          <p className="text-sm text-text-muted">
            Figma MCP editing is not connected through this companion yet. A supported,
            authenticated Figma client is required for the live trial.
          </p>
          <p className="text-xs text-text-muted">
            Saving a link or arranging windows does not grant design access.
          </p>
        </section>
        <section className="space-y-3" aria-label="Import Figma export">
          <h3 className="text-sm font-medium">Bring an asset back</h3>
          <p className="text-sm text-text-muted">
            Import a Figma export as an output, then use it in another member of your Cruxspace.
          </p>
          <label className="block text-sm" htmlFor="figma-output-label">
            Asset name
          </label>
          <input
            id="figma-output-label"
            className="w-full p-2 text-sm bg-surface-solid text-text border border-border rounded-[var(--radius-sm)]"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder="Home page artwork"
            disabled={busy || historical}
          />
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            aria-label="Choose Figma export"
            accept=".png,.jpg,.jpeg,.webp,.svg,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file || !project?.reference) return;
              void act(async () => {
                const output = await importFigmaExport(
                  owner,
                  file,
                  label.trim() || file.name,
                  project.reference!.url,
                );
                await refresh();
                setNotice(`Imported ${output.label}. It is available in Cruxspace assets.`);
              });
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || historical || !project?.reference || dirty || changed}
              onClick={() => fileInput.current?.click()}
            >
              Import export
            </Button>
            <CruxspaceAssetsButton />
          </div>
          <p className="text-xs text-text-muted">
            PNG, JPEG, WebP, SVG or PDF · up to 32 MB. Growth keeps the imported files and source
            link; the editable design and its history remain in Figma.
          </p>
        </section>
      </div>
    </div>
  );
}
