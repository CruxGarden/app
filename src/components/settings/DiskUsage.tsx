import { useCallback, useEffect, useState } from 'react';
import SettingsSection from './SettingsSection';
import { Button } from '@/components/ui';
import { Capability, can, type DiskUsageSummary } from '@/lib/platform';
import { formatBytes } from '@/lib/format';
import { shortenHomePath } from '@/services/desktop';

/** One row per place the Garden keeps bytes, in the order a person thinks of them. */
const ROWS: { key: keyof DiskUsageSummary; label: string }[] = [
  { key: 'projectFoldersBytes', label: 'Project Folders' },
  { key: 'blobStoreBytes', label: 'Blob Store (file content and history)' },
  { key: 'historyBytes', label: 'History records' },
  { key: 'toolInstallsBytes', label: 'Installed tools' },
  { key: 'cacheBytes', label: 'Caches' },
  { key: 'otherBytes', label: 'Settings, logs and other files' },
];

/**
 * Settings → Garden and backups → Disk use. How much this Garden takes on
 * this computer, and the one thing that is safe to clear: regenerable caches.
 */
export default function DiskUsage() {
  if (!can(Capability.DiskUsage)) return null;
  return <DiskUsageSection />;
}

function DiskUsageSection() {
  const [summary, setSummary] = useState<DiskUsageSummary | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const measure = useCallback(async (fresh = false) => {
    const bridge = window.electronAPI;
    if (!bridge?.diskUsage) return;
    setMeasuring(true);
    setError(null);
    try {
      setSummary(await bridge.diskUsage({ fresh }));
    } catch {
      setError('Disk use could not be measured. Try again.');
    } finally {
      setMeasuring(false);
    }
  }, []);
  useEffect(() => {
    void measure();
  }, [measure]);

  const clear = async () => {
    const bridge = window.electronAPI;
    if (!bridge?.clearCaches) return;
    setClearing(true);
    setMessage(null);
    setError(null);
    try {
      const { freedBytes } = await bridge.clearCaches();
      setMessage(
        freedBytes > 0
          ? `Cleared ${formatBytes(freedBytes)} of caches.`
          : 'Caches were already empty.',
      );
      await measure(true);
    } catch {
      setError('Caches could not be cleared. Nothing else was touched.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <SettingsSection
      title="Disk use"
      testId="disk-usage"
      aside={
        summary && (
          <span className="text-xxs font-mono text-text-muted">
            {formatBytes(summary.totalBytes)} on this computer
          </span>
        )
      }
    >
      {!summary ? (
        <p className="text-xs text-text-muted" role="status">
          {error ?? 'Measuring…'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col text-xxs">
            {ROWS.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-baseline justify-between gap-2 py-1 border-t border-border/(--tint-medium) first:border-t-0"
              >
                <dt className="text-text">{label}</dt>
                <dd className="font-mono text-text-muted">{formatBytes(Number(summary[key]))}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xxs text-text-muted">
            Garden {shortenHomePath(summary.roots.garden)} · measured{' '}
            {new Date(summary.measuredAt).toLocaleTimeString()}
            {summary.complete ? '' : ' · still counting; these are at least the sizes shown'}
          </p>
          <p className="text-xs text-text-muted">
            Edit history, Growth versions and Task states keep their file content once in the Blob
            Store, shared wherever it is the same. Routine edit history stays within automatic
            limits; versions you mark are kept. Caches are only for speed and refill as you work.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={clearing || measuring}
              loading={clearing}
              onClick={() => void clear()}
            >
              Clear caches
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={clearing || measuring}
              loading={measuring}
              onClick={() => void measure(true)}
            >
              Measure again
            </Button>
          </div>
          {message && (
            <p className="text-xs text-text-muted" role="status" data-testid="disk-usage-result">
              {message}
            </p>
          )}
          {error && (
            <p className="text-xs text-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
