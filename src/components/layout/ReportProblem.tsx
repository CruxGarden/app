import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import type { DesktopInfo } from '@/lib/platform';
import { Capability, can } from '@/lib/platform';
import { getDesktopInfo, openLogs, openWeb } from '@/services/desktop';
import { problemDetails, problemIssueUrl } from '@/lib/problem-report';
import { toast } from '@/stores/toastStore';

/**
 * Report a problem (EF04, ADR 0008). The app sends nothing: this says exactly
 * what an issue will be prefilled with, opens it in the person's own browser,
 * and shows where the local logs are should they choose to attach one.
 */
export default function ReportProblem() {
  const desktop = can(Capability.DesktopChrome);
  // undefined: still asking the shell. null: no shell (the web builder).
  const [info, setInfo] = useState<DesktopInfo | null | undefined>(desktop ? undefined : null);
  useEffect(() => {
    if (desktop) void getDesktopInfo().then(setInfo);
  }, [desktop]);
  const ready = info !== undefined;
  const details = ready ? problemDetails(info) : [];

  return (
    <div data-testid="report-problem" className="flex flex-col gap-3 text-sm text-text">
      <p>
        Problems are reported as GitHub issues that you write and post yourself. Crux Garden never
        sends anything on its own.
      </p>
      <div>
        <p className="text-xs text-text-muted mb-1.5">
          Opening an issue fills in only this, with room for your description:
        </p>
        <pre
          data-testid="report-details"
          className="text-xs font-mono text-text whitespace-pre-wrap rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 min-h-[3.25rem]"
        >
          {details.join('\n')}
        </pre>
      </div>
      <p className="text-xs text-text-muted">
        {desktop
          ? 'Logs stay on this computer. If they would help, open the folder and attach main.log to your issue yourself — look it over first.'
          : 'No logs, files or conversations are included.'}
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="primary"
          disabled={!ready}
          onClick={async () => {
            if (!(await openWeb(problemIssueUrl(info ?? null))))
              toast("Couldn't open your browser.", { tone: 'error' });
          }}
        >
          Open an issue
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!ready}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(details.join('\n'));
              toast('Copied details');
            } catch {
              toast("Couldn't copy the details.", { tone: 'error' });
            }
          }}
        >
          Copy details
        </Button>
        {desktop && (
          <Button size="sm" variant="secondary" onClick={() => void openLogs()}>
            Show logs
          </Button>
        )}
      </div>
    </div>
  );
}
