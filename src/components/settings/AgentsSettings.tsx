import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, Button, Toggle } from '@/components/ui';
import { Capability, can } from '@/lib/platform';
import type { AgentHostServer } from '@/lib/platform';
import type { Crux } from '@/api/types';
import { useGardenStore } from '@/stores/gardenStore';
import { agentHost, connectSnippets, serverKey } from '@/services/agent-host';
import { shortenHomePath } from '@/services/desktop';
import { cn } from '@/lib/cn';

/**
 * Settings → Agents (ADR 0013): switch the Agent Host on per crux, see the
 * running servers, and copy the one line that connects Claude Code, Codex or
 * Cursor to a crux. Off by default for every crux. Desktop Mode only — Web
 * Mode has no Project Folder to host.
 */
export default function AgentsSettings() {
  const available = can(Capability.AgentHost);
  const cruxes = useGardenStore((s) => s.allCruxes);
  const loadGarden = useGardenStore((s) => s.load);
  const [servers, setServers] = useState<AgentHostServer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    if (cruxes.length === 0) void loadGarden();
    agentHost.list().then(setServers);
    return agentHost.onChanged(setServers);
  }, [available, cruxes.length, loadGarden]);

  const hostable = useMemo(
    () =>
      cruxes
        .filter((c) => c.type === 'workspace' && typeof c.meta?.projectFolder === 'string')
        .sort((a, b) => (a.title || a.slug).localeCompare(b.title || b.slug)),
    [cruxes],
  );
  const running = useMemo(() => new Map(servers.map((s) => [s.cruxId, s])), [servers]);

  const run = useCallback(async (cruxId: string, fn: () => Promise<unknown>) => {
    setBusy(cruxId);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  if (!available) return null;

  return (
    <Panel padding="md" data-testid="agents-settings">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display text-sm font-medium text-accent">Agents</h2>
        <span className="text-xxs font-mono text-text-muted">
          {servers.length === 0
            ? 'no servers running'
            : `${servers.length} server${servers.length === 1 ? '' : 's'} running`}
        </span>
      </div>

      <div className="flex flex-col gap-3 text-xs">
        <p className="text-text-muted">
          Bring your own agent. Each crux you switch on gets its own MCP server on this machine
          (127.0.0.1 only) that Claude Code, Codex, Cursor or any MCP client can connect to — the
          same tools the built-in collaborator has.
        </p>

        {/* ADR 0008-style plain statement: what an outside agent can do and see */}
        <div
          className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-2xs text-text-muted leading-relaxed"
          data-testid="agents-trust"
        >
          <strong className="text-text">What a connected agent can do and see.</strong> It can read,
          write, search and rename files in that crux&apos;s Project Folder, run the site check,
          change the theme and soundscape, take and restore Growth snapshots, and read the persona,
          preview URL and AGENTS.md. Deleting a file and publishing wait for your approval in the
          app. Everything it does is recorded in the Collaboration under its name and in Growth. It
          cannot reach other cruxes, your API keys, or your account. The token in{' '}
          <code>.crux/mcp.json</code> is the only key; it stays on this machine, is never published
          or versioned, and changes every time you switch a crux on.
        </div>

        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}

        {hostable.length === 0 ? (
          <p className="text-text-muted">No cruxes with a Project Folder yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border" data-testid="agents-crux-list">
            {hostable.map((crux) => (
              <CruxRow
                key={crux.id}
                crux={crux}
                server={running.get(crux.id) ?? null}
                busy={busy === crux.id}
                expanded={open === crux.id}
                onToggleExpanded={() => setOpen(open === crux.id ? null : crux.id)}
                onSwitch={(on) =>
                  run(crux.id, async () => {
                    if (on) {
                      await agentHost.enable(crux.id);
                      setOpen(crux.id);
                    } else {
                      await agentHost.disable(crux.id);
                      if (open === crux.id) setOpen(null);
                    }
                  })
                }
                onRegenerate={() => run(crux.id, () => agentHost.regenerate(crux.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function CruxRow({
  crux,
  server,
  busy,
  expanded,
  onToggleExpanded,
  onSwitch,
  onRegenerate,
}: {
  crux: Crux;
  server: AgentHostServer | null;
  busy: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSwitch: (on: boolean) => void;
  onRegenerate: () => void;
}) {
  const title = crux.title || crux.slug;
  return (
    <li className="py-2 flex flex-col gap-2" data-testid={`agents-crux-${crux.slug}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-text truncate">{title}</div>
          <div className="text-2xs font-mono text-text-muted truncate">
            {server ? (
              <>
                <span className="text-accent">on</span> · {server.url}
                {server.clients.length > 0 && ` · connected: ${server.clients.join(', ')}`}
              </>
            ) : (
              'off'
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {server && (
            <Button size="sm" variant="ghost" onClick={onToggleExpanded}>
              {expanded ? 'Hide' : 'Connect'}
            </Button>
          )}
          <Toggle
            label={`Agent access for ${title}`}
            checked={!!server}
            disabled={busy}
            onChange={onSwitch}
          />
        </div>
      </div>
      {server && expanded && (
        <ConnectPanel server={server} busy={busy} onRegenerate={onRegenerate} />
      )}
    </li>
  );
}

function ConnectPanel({
  server,
  busy,
  onRegenerate,
}: {
  server: AgentHostServer;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const snippets = connectSnippets(server);
  const [tab, setTab] = useState<keyof typeof snippets>('claudeCode');
  const labels: Record<keyof typeof snippets, string> = {
    claudeCode: 'Claude Code',
    codex: 'Codex',
    cursor: 'Cursor',
    stdio: 'stdio',
  };
  const hints: Record<keyof typeof snippets, string> = {
    claudeCode: 'Run in a terminal, then start claude in the Project Folder.',
    codex: 'Add to ~/.codex/config.toml.',
    cursor: 'Add to .cursor/mcp.json in the Project Folder (or ~/.cursor/mcp.json).',
    stdio: 'For clients that only speak stdio — a thin proxy to the same server.',
  };

  return (
    <div
      className="rounded-[var(--radius-sm)] border border-border bg-surface p-3 flex flex-col gap-2"
      data-testid="agents-connect"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {(Object.keys(labels) as Array<keyof typeof snippets>).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                tab === k ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text',
              )}
            >
              {labels[k]}
            </button>
          ))}
        </div>
        <CopyButton text={snippets[tab]} label={`Copy ${labels[tab]} snippet`} />
      </div>
      <pre
        className="text-2xs font-mono leading-relaxed bg-code-block border border-code-block-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-text"
        data-testid="agents-snippet"
      >
        {snippets[tab]}
      </pre>
      <p className="text-2xs text-text-muted">{hints[tab]}</p>

      <div className="divider my-1" />

      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-center text-2xs font-mono">
        <span className="text-text-muted">server</span>
        <span className="truncate text-text">{serverKey(server.slug)}</span>
        <CopyButton text={server.url} label="Copy URL" />
        <span className="text-text-muted">token</span>
        <span className="truncate text-text" data-testid="agents-token">
          {server.token.slice(0, 6)}…{server.token.slice(-4)}
        </span>
        <CopyButton text={server.token} label="Copy token" />
        <span className="text-text-muted">config</span>
        <span className="truncate text-text">{shortenHomePath(server.configPath)}</span>
        <span />
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-2xs text-text-muted">
          A new token disconnects every client until they use the new one.
        </span>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onRegenerate}>
          Regenerate token
        </Button>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={label}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {},
        );
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}
