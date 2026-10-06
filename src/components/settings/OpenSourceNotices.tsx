import { useEffect, useState } from 'react';
import { Spinner, rowClass } from '@/components/ui';
import { loadNotices, type Notices } from '@/lib/notices';

/**
 * The third-party notices the build collected (vite-plugin-notices.ts), read
 * only when this view opens. One row per component; its licence text unfolds
 * in place.
 */
export default function OpenSourceNotices() {
  // undefined: loading. null: this build carries no notices file.
  const [notices, setNotices] = useState<Notices | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    let current = true;
    void loadNotices().then((value) => current && setNotices(value));
    return () => {
      current = false;
    };
  }, []);

  if (notices === undefined)
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-text-muted">
        <Spinner /> Loading notices…
      </p>
    );
  if (!notices)
    return (
      <p role="status" data-testid="notices-missing" className="text-sm text-text-muted">
        Notices are collected when the app is built; this development run has none to show.
      </p>
    );
  return (
    <div data-testid="notices" className="min-h-0 flex flex-col gap-3">
      <p className="text-xs text-text-muted whitespace-pre-line">
        {notices.preamble}
        {'\n'}Each Crux Tool also lists its own notices under its Tool information.
      </p>
      <ul className="min-h-0 overflow-y-auto flex flex-col" aria-label="Components">
        {notices.entries.map((entry, index) => (
          <li key={`${entry.name}:${index}`} className="border-b border-border last:border-b-0">
            <button
              type="button"
              aria-expanded={open === index}
              className={rowClass(open === index, 'flex items-baseline justify-between gap-3')}
              onClick={() => setOpen(open === index ? null : index)}
            >
              <span className="min-w-0 truncate text-sm">{entry.name}</span>
              {entry.license && (
                <span className="shrink-0 text-xxs font-mono text-text-muted">{entry.license}</span>
              )}
            </button>
            {open === index && (
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-2.5 py-2 text-xxs font-mono text-text-muted">
                {entry.text}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
