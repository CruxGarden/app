import { useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui';
import { can, Capability } from '@/lib/platform';
import { pathOf } from '@/lib/artifact-path';
import { registerBlenderOutput } from '@/services/blender';
import { revealProjectFolder } from '@/services/project-folder';
import CruxspaceAssetsButton from './CruxspaceAssetsButton';

export default function BlenderPane() {
  const crux = useCruxStore((s) => s.crux)!;
  const files = useCruxStore((s) => s.artifacts);
  const historical = useCruxStore((s) => !!s.viewingSnapshotId || !!s.crux?.meta?.workingCopy);
  const refresh = useCruxStore((s) => s.refreshArtifacts);
  const openFile = useWorkspaceUIStore((s) => s.openFile);
  const setView = useWorkspaceUIStore((s) => s.setWorkshopView);
  const [selected, setSelected] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const candidates = files.filter(
    (f) => /\.(png|jpe?g|webp|glb)$/i.test(pathOf(f)) && !pathOf(f).startsWith('exports/'),
  );
  const scene = files.find((f) => pathOf(f) === 'scene.blend');
  async function act(work: () => Promise<void>) {
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
  if (historical)
    return (
      <p className="p-5 text-sm">
        Return to Main and the current version to use the Blender companion. Saved scenes and
        outputs are available in Artifacts.
      </p>
    );
  return (
    <div
      className="h-full min-h-0 overflow-auto bg-surface-solid p-5"
      data-testid="blender-companion"
    >
      <div className="max-w-xl mx-auto space-y-5">
        <header className="space-y-2">
          <p className="text-xs text-text-muted">External app · Proof of concept</p>
          <h2 className="text-xl font-medium">Make something together in Blender</h2>
          <p className="text-sm text-text-muted">
            Work on the same editable scene. Keep your brief, Collaboration, renders and game assets
            here.
          </p>
        </header>
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
        <section className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="font-medium">Your scene</h3>
          <p className="text-sm text-text-muted">
            {scene
              ? 'scene.blend is saved in Artifacts.'
              : 'Save scene.blend in this Crux’s Project Folder to preserve your editable work.'}{' '}
            Save in Blender after editing; unsaved changes are not in Growth.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                const brief = files.find((f) => pathOf(f) === 'brief.md');
                if (brief) {
                  openFile(brief.id, 'brief.md');
                  setView('advanced');
                }
              }}
            >
              Edit brief
            </Button>
            {can(Capability.ProjectFolder) && (
              <Button disabled={busy} onClick={() => void act(() => revealProjectFolder(crux.id))}>
                Show Project Folder
              </Button>
            )}
          </div>
          {can(Capability.BlenderWindowArrangement) && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() => void act(() => window.electronAPI!.blenderDesktop!.open())}
              >
                Open Blender
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await window.electronAPI!.blenderDesktop!.arrange('left');
                    setNotice('Windows arranged.');
                  })
                }
              >
                Arrange beside Garden
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await window.electronAPI!.blenderDesktop!.restore();
                    setNotice('Previous layout restored.');
                  })
                }
              >
                Restore layout
              </Button>
            </div>
          )}
        </section>
        <section className="space-y-2 rounded-lg border border-border p-4">
          <h3 className="font-medium">Connect your collaborator</h3>
          <p className="text-sm text-text-muted">
            Choose Claude Code in Collaboration with the Blender MCP connection configured and its
            local Blender bridge running. Other Garden providers are not connected by this POC.
            Opening Blender does not establish tool access.
          </p>
          <p className="text-sm text-text-muted">
            Ask your collaborator to inspect the open scene before editing, preserve your changes,
            and save the scene and exports in this Project Folder.
          </p>
        </section>
        <section className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="font-medium">Share a saved output</h3>
          <p className="text-sm text-text-muted">
            Save a PNG render or GLB model here, then make it available to your Cruxspace. Each
            output records the current saved scene version.
          </p>
          <label className="block text-sm" htmlFor="blender-output">
            Saved Artifact
          </label>
          <select
            id="blender-output"
            className="w-full rounded border border-border bg-surface p-2 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose an output</option>
            {candidates.map((f) => (
              <option key={f.id} value={`${f.id}:${f.fingerprint}`}>
                {pathOf(f)}
              </option>
            ))}
          </select>
          <label className="block text-sm" htmlFor="blender-label">
            Output name
          </label>
          <input
            id="blender-label"
            className="w-full rounded border border-border bg-surface p-2 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
          />
          <Button
            disabled={busy || !selected || !label.trim() || !scene}
            onClick={() =>
              void act(async () => {
                const file = candidates.find((f) => `${f.id}:${f.fingerprint}` === selected);
                if (!file?.fingerprint)
                  throw new Error('The selected Artifact changed. Choose its current version.');
                await registerBlenderOutput(crux.id, pathOf(file), file.fingerprint, label);
                await refresh();
                setNotice('Output saved for your Cruxspace.');
              })
            }
          >
            Save output
          </Button>
          <CruxspaceAssetsButton />
        </section>
      </div>
    </div>
  );
}
