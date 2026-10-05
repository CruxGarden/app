import { listShortcuts } from '@/lib/shortcuts';
import { Capability, can } from '@/lib/platform';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { isMac } from './command-score';

/**
 * Keyboard shortcuts, read from the same table the key handler and the
 * application menu use (lib/shortcuts), so the list cannot drift from the keys.
 */
export default function ShortcutsList() {
  const collaborator = useAiEnabled();
  const groups = listShortcuts({
    mac: isMac,
    desktop: can(Capability.DesktopChrome),
    collaborator,
  });
  return (
    <div data-testid="shortcuts-list" className="min-h-0 overflow-y-auto flex flex-col gap-4">
      {groups.map(({ group, rows }) => (
        <section key={group} aria-label={group}>
          <h3 className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-text-muted">
            {group}
          </h3>
          <dl className="flex flex-col">
            {rows.map((row) => (
              <div
                key={row.id}
                data-shortcut={row.id}
                className="flex items-center justify-between gap-4 py-1.5 border-b border-border last:border-b-0"
              >
                <dt className="text-sm text-text">{row.label}</dt>
                <dd className="flex shrink-0 items-center gap-1">
                  {row.keys.map((key) => (
                    <kbd
                      key={key}
                      className="min-w-6 text-center text-xxs font-mono text-text px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-border bg-bg"
                    >
                      {key}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
