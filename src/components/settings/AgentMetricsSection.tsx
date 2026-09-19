import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Toggle } from '@/components/ui';
import {
  DEFAULT_METRICS_PATH,
  isCapturing,
  logEntry,
  readMetrics,
  report,
  resetMetrics,
  setCapturing,
  unknownTargetRate,
  type AgentMetrics,
} from '@/services/agent-metrics';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { appendGardenFile, getGardenRoot, shortenHomePath } from '@/services/desktop';
import { isDesktop } from '@/lib/platform';

/**
 * Agent metrics — what the collaborator cost, in time and in wasted work.
 *
 * A switch, the headline numbers, and a way to get the whole report out: on
 * desktop it writes a file inside the Garden Root, on web it downloads one.
 * The counters hold no content — tool names, outcome labels and numbers only.
 */
export default function AgentMetricsSection() {
  const [capturing, setCapturingState] = useState(isCapturing);
  const [metrics, setMetrics] = useState<AgentMetrics>(readMetrics);
  const [path, setPath] = useState(
    () => getSetting(SettingsKey.AgentMetricsPath) || DEFAULT_METRICS_PATH,
  );
  const [root, setRoot] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isDesktop()) return;
    let live = true;
    getGardenRoot()
      .then((r) => live && setRoot(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // The readout is a snapshot: turns land while the panel is open.
  const refresh = useCallback(() => setMetrics({ ...readMetrics() }), []);

  const toggle = (on: boolean) => {
    setCapturing(on);
    setCapturingState(on);
    setStatus('');
    setError('');
  };

  const savePath = (value: string) => {
    setPath(value);
    setSetting(SettingsKey.AgentMetricsPath, value);
  };

  const save = useCallback(async () => {
    setStatus('');
    setError('');
    const current = { ...readMetrics() };
    setMetrics(current);
    const entry = logEntry(current);
    const relPath = path.trim() || DEFAULT_METRICS_PATH;
    try {
      const written = await appendGardenFile(relPath, entry);
      if (written) {
        setStatus(`Appended to ${shortenHomePath(written)}`);
        return;
      }
      const url = URL.createObjectURL(new Blob([entry], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = relPath.replace(/^.*\//, '') || DEFAULT_METRICS_PATH;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Downloaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The report could not be saved.');
    }
  }, [path]);

  const copy = useCallback(() => {
    const current = { ...readMetrics() };
    setMetrics(current);
    navigator.clipboard.writeText(report(current)).then(
      () => setStatus('Copied'),
      () => setError('The clipboard is not available.'),
    );
  }, []);

  const clear = useCallback(() => {
    resetMetrics();
    setMetrics({ ...readMetrics() });
    setStatus('Counters reset');
    setError('');
  }, []);

  const guessed = unknownTargetRate(metrics);

  return (
    <div className="space-y-3" data-testid="agent-metrics">
      <Toggle checked={capturing} onChange={toggle} label="Record agent metrics" />
      <p className="text-xs text-text-muted">
        Speed and accuracy for every turn — time to first word, how long tools take, and which tool
        calls fail and why. Kept on this machine; tool names and counts only, never your files or
        what you wrote.
      </p>

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Turns" value={String(metrics.turns)} />
        <Stat label="Tool calls" value={String(guessed.calls)} />
        <Stat
          label="Named nothing"
          value={guessed.calls ? `${(guessed.rate * 100).toFixed(1)}%` : '—'}
          hint="Calls that failed because the model named something that does not exist"
        />
        <Stat label="Since" value={metrics.since.slice(0, 10)} />
      </dl>

      {isDesktop() && (
        <label className="block space-y-1">
          <span className="text-xs text-text-muted">
            Append to{root ? ` ${shortenHomePath(root)}/` : ' the Garden Root: '}
          </span>
          <Input
            value={path}
            onChange={(e) => savePath(e.target.value)}
            placeholder={DEFAULT_METRICS_PATH}
            aria-label="Report file path, relative to the Garden Root"
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={save} disabled={!metrics.turns}>
          {isDesktop() ? 'Append report' : 'Download report'}
        </Button>
        <Button size="sm" variant="ghost" onClick={copy} disabled={!metrics.turns}>
          Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={refresh}>
          Refresh
        </Button>
        <Button size="sm" variant="danger" onClick={clear} disabled={!metrics.turns}>
          Reset
        </Button>
      </div>

      {status && <p className="text-xs text-text-muted">{status}</p>}
      {error && <p className="text-xs text-error">{error}</p>}

      {metrics.turns > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
            Full report
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-[var(--radius-sm)] border border-border bg-surface p-3 text-xxs font-mono whitespace-pre-wrap text-text">
            {report(metrics)}
          </pre>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-mono text-text">{value}</dd>
    </div>
  );
}
