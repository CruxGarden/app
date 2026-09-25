import { useState } from 'react';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import {
  cruxspaceTemplates,
  startCruxspaceTemplate,
  type ExampleMode,
} from '@/services/cruxspace-templates';
import { useGardenStore } from '@/stores/gardenStore';
import { Button } from '@/components/ui';
import { gardenPath } from '@/stores/gardenContext';

/** Outcome picker shared by first-garden onboarding and Add Crux. */
export default function Undertakings({
  onStarted,
  onBusy,
}: {
  onStarted: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const navigate = useMoodNavigate();
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ExampleMode>('beside');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const template = cruxspaceTemplates.find((entry) => entry.id === selected);
  async function start() {
    if (!template || busy) return;
    setBusy(true);
    onBusy(true);
    setError('');
    setStatus('Opening your undertaking…');
    try {
      const result = await startCruxspaceTemplate({
        templateId: template.id,
        name,
        exampleMode: mode,
        onProgress: setStatus,
      });
      await useGardenStore.getState().load();
      onStarted();
      navigate(gardenPath(result.space.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
      setStatus('');
    }
  }
  return (
    <section aria-label="Undertakings" className="space-y-5 overflow-auto">
      <div>
        <h2 className="text-lg">What do you want to make?</h2>
        <p className="text-sm text-text-muted mt-2">
          Each undertaking is a new Garden of notes and creations around one aim, with a worked
          example to learn from. Work on your own or with a collaborator.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cruxspaceTemplates.map((entry) => (
          <button
            key={entry.id}
            disabled={busy}
            aria-pressed={selected === entry.id}
            data-undertaking-id={entry.id}
            onClick={() => {
              setSelected(entry.id);
              setName(entry.name);
              setError('');
            }}
            className={`text-left rounded-[var(--radius)] border p-4 cursor-pointer ${selected === entry.id ? 'border-accent bg-accent-muted' : 'border-border bg-panel hover:border-accent'}`}
          >
            <h3 className="text-base">{entry.name}</h3>
            <p className="text-sm text-text-muted mt-2">{entry.description}</p>
          </button>
        ))}
      </div>
      {template && (
        <div className="space-y-4 border-t border-border pt-4">
          <label className="block text-sm">
            Garden name
            <input
              className="block mt-1 w-full border border-border rounded p-2 bg-surface-solid"
              value={name}
              maxLength={120}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="text-sm">
            <strong>Inside:</strong> {template.members.join(' · ')}
          </p>
          <p className="text-sm">
            <strong>First change:</strong> {template.firstTask}
          </p>
          <p className="text-sm">
            <strong>Finish line:</strong> {template.finishLine}
          </p>
          <fieldset disabled={busy} className="text-sm space-y-2">
            <legend className="mb-2">How would you like to begin?</legend>
            <label className="flex gap-2">
              <input
                type="radio"
                name="undertaking-example"
                checked={mode === 'beside'}
                onChange={() => setMode('beside')}
              />
              Start fresh, with the worked example inside
            </label>
            <label className="flex gap-2">
              <input
                type="radio"
                name="undertaking-example"
                checked={mode === 'start'}
                onChange={() => setMode('start')}
              />
              Use the worked example as my starting point
            </label>
          </fieldset>
          <p className="text-xs text-text-muted">
            Example: {template.example}. Its recorded Growth can be explored in the Garden’s
            history.
          </p>
          <Button onClick={() => void start()} disabled={busy || !name.trim()}>
            {busy ? 'Opening…' : 'Start undertaking'}
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm text-text-muted">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
