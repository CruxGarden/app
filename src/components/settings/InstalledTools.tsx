import { useState } from 'react';
import { Button } from '@/components/ui';
import { getServices } from '@/services';
import { toolManifest } from '@/services/crux-tools/registry';
import { useInstalledTools, forgetInstalledTool } from '@/services/crux-tools/installed';
import { formatDateTime } from '@/lib/format';
import { choiceDialog } from '@/stores/dialogStore';

/**
 * Settings → Data → Installed tools (CRUX-TOOLS-DISTRIBUTION-PLAN §3.6): the
 * Crux Tools this garden installed, where each came from, and Remove. A
 * Crux made from a tool keeps its own Artifacts (cloned by fingerprint), so
 * removing the tool takes nothing from it; it only stops new Cruxes being
 * made from the tool until it is installed again.
 */
export default function InstalledTools() {
  const tools = useInstalledTools();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const list = Object.values(tools).sort((a, b) => a.id.localeCompare(b.id));
  const remove = async (id: string, cruxId: string) => {
    const name = toolManifest(id)?.name ?? id;
    const answer = await choiceDialog({
      title: `Remove ${name}?`,
      message:
        'Cruxes you made from it keep working; you will need to install it again to create a new one.',
      choices: [
        { id: 'cancel', label: 'Keep it', variant: 'ghost' },
        { id: 'remove', label: 'Remove', variant: 'danger' },
      ],
    });
    if (answer.choice !== 'remove') return;
    setBusy(id);
    setError('');
    try {
      await getServices()
        .crux.trash(cruxId)
        .catch(() => undefined);
      forgetInstalledTool(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div data-testid="installed-tools">
      <h3 className="font-display text-sm font-medium text-text mb-2">Installed tools</h3>
      <p className="text-xs text-text-muted mb-3">
        Crux Tools this garden installed from Explore or a .crux package. The build's own tools are
        not listed; they cannot be removed.
      </p>
      {list.length === 0 ? (
        <p className="text-xs text-text-muted">None yet. Explore ▸ Tools has them.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((t) => {
            const m = toolManifest(t.id);
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 text-sm"
                data-testid={`installed-tool-${t.id}`}
              >
                <div className="min-w-0">
                  <p className="text-text truncate">{m?.name ?? t.id}</p>
                  <p className="text-xs text-text-muted truncate">
                    {t.author ? `from @${t.author} · ` : 'from a .crux package · '}
                    {formatDateTime(t.installedAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === t.id}
                  onClick={() => void remove(t.id, t.cruxId)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs text-error mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
