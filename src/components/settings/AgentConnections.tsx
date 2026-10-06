import { useEffect, useState } from 'react';
import { Button, Input, Select, Toggle } from '@/components/ui';
import { CopyButton } from './AgentsSettings';
import type { AgentConnection, AgentKind } from '../../../electron/src/agent-connections';
import {
  AGENT_SCOPES,
  RECOMMENDED_SCOPES,
  SCOPE_LABELS,
  type AgentScope,
} from '../../../electron/src/agent-scopes';
import type { AgentConnectionSecret } from '../../../electron/src/bridge';
import { connectSnippets } from '@/services/agent-host';

const kinds: { id: AgentKind; name: string }[] = [
  { id: 'claude-code', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'claude-desktop', name: 'Claude Desktop' },
  { id: 'cli', name: 'crux command' },
  { id: 'other', name: 'Other MCP client' },
];
export default function AgentConnections({ onReady }: { onReady?: () => void }) {
  const bridge = window.electronAPI!.agentHost;
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [name, setName] = useState('My agent');
  const [kind, setKind] = useState<AgentKind>('claude-code');
  const [scopes, setScopes] = useState<AgentScope[]>([...RECOMMENDED_SCOPES]);
  const [secret, setSecret] = useState<AgentConnectionSecret | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void bridge
      .listConnections()
      .then((list) => {
        if (live) setConnections(list);
      })
      .catch(() => {
        if (live) setError('Could not load connections. Reopen this section to try again.');
      });
    const off = bridge.onConnectionsChanged(setConnections);
    return () => {
      live = false;
      off();
    };
  }, [bridge]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setConnections(await bridge.listConnections());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const snippets =
    secret &&
    connectSnippets({
      slug: secret.connection.id,
      url: secret.url,
      token: secret.token,
      stdioCommand: '',
    });
  const snippet =
    secret &&
    snippets &&
    (secret.connection.kind === 'claude-code'
      ? snippets.claudeCode
      : secret.connection.kind === 'codex'
        ? snippets.codex
        : secret.connection.kind === 'cli'
          ? /Windows/i.test(navigator.userAgent)
            ? `$env:CRUX_AGENT_TOKEN='${secret.token}'; crux list`
            : `export CRUX_AGENT_TOKEN='${secret.token}'\ncrux list`
          : secret.connection.kind === 'claude-desktop' && secret.stdio
            ? JSON.stringify(
                {
                  mcpServers: {
                    [`crux-${secret.connection.id}`]: {
                      ...secret.stdio,
                      env: { ELECTRON_RUN_AS_NODE: '1', CRUX_AGENT_TOKEN: secret.token },
                    },
                  },
                },
                null,
                2,
              )
            : snippets.cursor);
  return (
    <section
      aria-label="Whole garden connections"
      className="flex flex-col gap-3"
      data-testid="agents-garden-access"
    >
      <p className="text-xs text-text-muted">
        Give each outside agent its own connection. Choose what it can do across your Garden.
        Publishing and deleting files still require your approval.
      </p>
      <label className="text-xs">
        Connection name
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs">
        Agent
        <Select
          aria-label="Agent"
          value={kind}
          onChange={(e) => setKind(e.target.value as AgentKind)}
        >
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
      </label>
      <fieldset disabled={busy} className="flex flex-col gap-2">
        <legend className="text-xs mb-2">Permissions</legend>
        {AGENT_SCOPES.map((scope) => (
          <div key={scope} className="flex flex-col gap-1">
            <Toggle
              label={SCOPE_LABELS[scope].label}
              describedBy={`connection-scope-${scope}`}
              checked={scopes.includes(scope)}
              onChange={(on) =>
                setScopes(on ? [...scopes, scope] : scopes.filter((s) => s !== scope))
              }
            />
            <p id={`connection-scope-${scope}`} className="text-xs text-text-muted">
              {SCOPE_LABELS[scope].detail}
            </p>
          </div>
        ))}
      </fieldset>
      <Button
        disabled={busy || !name.trim() || !scopes.length}
        size="sm"
        onClick={() =>
          void run(async () => {
            setSecret(await bridge.createConnection({ name, kind, scopes }));
            onReady?.();
          })
        }
      >
        Add connection
      </Button>
      {secret && (
        <div
          className="border border-border rounded-card p-3 flex flex-col gap-2"
          data-testid="agent-connection-secret"
        >
          <strong className="text-sm">Connect {secret.connection.name}</strong>
          <p className="text-xs text-text-muted">
            Copy this now. The token is shown only here; closing this section hides it. You can
            replace it later.
          </p>
          <p className="text-xs text-text-muted">
            {secret.connection.kind === 'codex'
              ? 'Add this to your Codex config.toml.'
              : secret.connection.kind === 'claude-code' || secret.connection.kind === 'cli'
                ? 'Run this in your terminal.'
                : secret.connection.kind === 'claude-desktop'
                  ? 'Add this to claude_desktop_config.json and restart Claude Desktop.'
                  : 'Add this HTTP MCP connection to your client’s configuration.'}
          </p>
          <pre
            data-testid="agents-snippet"
            className="text-2xs font-mono bg-code-block border border-code-block-border rounded p-2 whitespace-pre-wrap break-all"
          >
            {snippet}
          </pre>
          <CopyButton text={snippet || ''} label="Copy connection setup" />
          <CopyButton text={secret.token} label="Copy token" />
          <Button variant="ghost" size="xs" onClick={() => setSecret(null)}>
            Done copying
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {connections.map((connection) => (
          <li
            key={connection.id}
            className="border border-border rounded-card p-3"
            data-testid="agent-connection"
          >
            <strong>{connection.name}</strong>
            <p className="text-xs text-text-muted">
              {connection.lastUsed
                ? `Last used ${new Date(connection.lastUsed).toLocaleString()}`
                : 'Not connected yet'}{' '}
              · token ending {connection.tokenHint}
            </p>
            <details>
              <summary className="text-xs cursor-pointer">Edit permissions</summary>
              {AGENT_SCOPES.map((scope) => (
                <Toggle
                  key={scope}
                  label={`${SCOPE_LABELS[scope].label} for ${connection.name}`}
                  checked={connection.scopes.includes(scope)}
                  disabled={busy}
                  onChange={(on) =>
                    void run(async () => {
                      await bridge.updateConnection(connection.id, {
                        scopes: on
                          ? [...connection.scopes, scope]
                          : connection.scopes.filter((s) => s !== scope),
                      });
                    })
                  }
                />
              ))}
            </details>
            <div className="flex gap-2 mt-2">
              <Button
                size="xs"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => setSecret(await bridge.rotateConnection(connection.id)))
                }
              >
                Replace token
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await bridge.revokeConnection(connection.id);
                    if (secret?.connection.id === connection.id) setSecret(null);
                  })
                }
              >
                Remove connection
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </section>
  );
}
