import { rankLocalModels } from './local-model-fit';
import type { LocalModelHardware } from '../../../electron/src/bridge';
import { useCallback, useEffect, useState } from 'react';
import { Button, Select } from '@/components/ui';
import AgentConnections from '@/components/settings/AgentConnections';
import { setDefaultModel } from '@/ai/keys';
import { PROVIDERS } from '@/ai/providers';
import { detectLocalEndpoints, isToolCapableLocalModel, sortLocalModels } from '@/ai/local';
import { SettingsKey } from '@/lib/constants';
import type { LocalAiEndpoint } from '@/lib/platform';
import type { AgentStatus } from '../../../electron/src/bridge';
import { useSetting } from '@/hooks/useSetting';
import { agentStatus } from '@/services/agent-provider';
import { openWeb } from '@/services/desktop';
import { CopyButton } from '@/components/settings/AgentsSettings';
import SetupSection from './SetupSection';
import { toast } from '@/stores/toastStore';
import { useSetupWizard } from './setup-store';
import { WINDOWS_PATH_LINE, pathLine } from './setup-plan';
import { LM_STUDIO_URL, OLLAMA_DOWNLOAD_URL, formatBytes, formatTimeLeft } from './ollama-pull';
import {
  cancelRecommendedDownload,
  startRecommendedDownload,
  useLocalDownload,
} from './local-download';

interface SectionProps {
  open: boolean;
  onOpen: () => void;
  onLater: () => void;
}

/** Ollama / LM Studio: detect, offer the download, fetch a recommended model, make it the default. */
export function LocalModelsSection({ open, onOpen, onLater }: SectionProps) {
  const set = useSetupWizard((s) => s.set);
  const defaultModel = useSetting(SettingsKey.DefaultModel);
  const [endpoints, setEndpoints] = useState<LocalAiEndpoint[] | null>(null);
  const {
    pulling,
    model: downloading,
    progress,
    secondsLeft,
    error,
    revision,
  } = useLocalDownload();
  const [hardware, setHardware] = useState<LocalModelHardware | null>(null);
  const [selection, setSelection] = useState('');
  useEffect(() => {
    let live = true;
    void window.electronAPI?.localai
      .hardware()
      .then((value) => {
        if (live) setHardware(value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const ranked = rankLocalModels(hardware);
  const recommended = ranked.find((m) => m.name === selection) ?? ranked[0]!;
  const activeModel = pulling && downloading ? downloading : recommended;
  const detect = useCallback(async () => {
    setEndpoints(await detectLocalEndpoints(true));
  }, []);
  useEffect(() => {
    void detect();
  }, [detect, revision]);

  const ollama = endpoints?.find((e) => e.id === 'ollama');
  const lmstudio = endpoints?.find((e) => e.id === 'lmstudio');
  const usable = (endpoints ?? []).flatMap((endpoint) =>
    sortLocalModels(endpoint.models)
      .filter(isToolCapableLocalModel)
      .map((model) => ({ id: `${endpoint.id}/${model}`, model, endpoint: endpoint.name })),
  );
  const chosen = usable.find((u) => u.id === defaultModel);

  const chooseModel = async (id: string) => {
    await setDefaultModel(id);
    set({ aiUsed: true });
    toast(`${id.slice(id.indexOf('/') + 1)} will help in your new Cruxes.`);
  };

  const status =
    endpoints === null
      ? 'Looking on this computer…'
      : chosen
        ? `Using ${chosen.model}`
        : usable.length > 0
          ? `${usable.length} model${usable.length === 1 ? '' : 's'} ready to use`
          : ollama || lmstudio
            ? `${(ollama ?? lmstudio)!.name} is running · no suitable model yet`
            : 'Not found on this computer';

  const total = progress?.total || activeModel.approxBytes;
  const percent = progress?.fraction != null ? Math.round(progress.fraction * 100) : null;

  return (
    <SetupSection
      id="local"
      title="Models on this computer"
      status={status}
      ready={!!chosen}
      checking={endpoints === null}
      open={open}
      onOpen={onOpen}
      onLater={onLater}
    >
      <p className="text-xs text-text-muted">
        Local inference runs on your computer. Downloads need an internet connection; tools you ask
        a model to use can still access online services.
      </p>

      {endpoints !== null && !ollama && !lmstudio && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void openWeb(OLLAMA_DOWNLOAD_URL)}>
            Get Ollama
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void openWeb(LM_STUDIO_URL)}>
            Or LM Studio
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void detect()}>
            Check again
          </Button>
          <p className="w-full text-xs text-text-muted">
            Install it, open it, then choose Check again.
          </p>
        </div>
      )}

      {(ollama || lmstudio) && (
        <Button variant="ghost" size="xs" onClick={() => void detect()}>
          Check again
        </Button>
      )}
      {usable.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Models ready to use">
          {usable.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-mono text-text">{u.model}</span>
                <span className="text-xs text-text-muted"> · {u.endpoint}</span>
              </span>
              {u.id === defaultModel ? (
                <span className="text-xs text-accent">Default for new Cruxes</span>
              ) : (
                <Button variant="secondary" size="xs" onClick={() => void chooseModel(u.id)}>
                  Use this
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {
        <div className="flex flex-col gap-2" data-testid="setup-local-download">
          <label className="text-xs flex flex-col gap-1">
            What fits my computer?
            <Select
              aria-label="What fits my computer?"
              value={recommended.name}
              disabled={pulling}
              onChange={(e) => setSelection(e.target.value)}
            >
              {ranked.map((model, i) => (
                <option key={model.name} value={model.name}>
                  {model.label} · {formatBytes(model.approxBytes)}
                  {i === 0 && hardware && model.fit !== 'tight' ? ' · Suggested' : ''}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs text-text-muted">
            {hardware
              ? `${formatBytes(hardware.memoryBytes)} RAM${hardware.unifiedMemory ? ' shared with GPU' : hardware.gpuMemoryBytes ? ` · ${formatBytes(hardware.gpuMemoryBytes)} GPU memory` : ' · GPU memory unknown'}`
              : 'Memory detection unavailable.'}{' '}
            · {recommended.detail}. These are estimates; context length and other apps affect fit.
            Smaller models are faster but less capable.
          </p>
          <p className="text-xs text-text-muted">
            {ollama ? 'Ollama is running. Download ' : 'After installing Ollama, download '}
            {activeModel.label}, a model that can make changes in your Crux (
            {progress?.total ? '' : 'about '}
            {formatBytes(total)}).
          </p>
          {pulling ? (
            <div className="flex flex-col gap-1.5">
              <div
                role="progressbar"
                aria-label={`Downloading ${activeModel.label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                aria-valuetext={
                  percent === null
                    ? (progress?.status ?? 'Starting')
                    : `${percent}% · ${formatBytes(progress?.completed ?? 0)} of ${formatBytes(total)}`
                }
                className="h-2 rounded-full bg-surface border border-border overflow-hidden"
              >
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${percent ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
                <span aria-live="polite">
                  {percent === null
                    ? (progress?.status ?? 'Starting…')
                    : `${percent}% · ${formatBytes(progress?.completed ?? 0)} of ${formatBytes(total)} · ${formatTimeLeft(secondsLeft)}`}
                </span>
                <Button variant="ghost" size="xs" onClick={cancelRecommendedDownload}>
                  Cancel download
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              className="self-start"
              disabled={!ollama}
              onClick={() => void startRecommendedDownload(recommended)}
            >
              {error ? 'Try the download again' : 'Download a recommended model'}
            </Button>
          )}
        </div>
      }

      {!ollama && lmstudio && (
        <p className="text-xs text-text-muted">
          In LM Studio, find {recommended.label}, download and load it, start the local server, then
          choose Check again.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </SetupSection>
  );
}

const AGENTS = Object.values(PROVIDERS).filter((p) => p.agent);

/** Claude Code and Codex in the Workshop: installed, signed in, and which one new Cruxes use. */
export function CodingAgentsSection({ open, onOpen, onLater }: SectionProps) {
  const set = useSetupWizard((s) => s.set);
  const defaultModel = useSetting(SettingsKey.DefaultModel);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const probe = useCallback(() => {
    for (const provider of AGENTS)
      void agentStatus(true, provider.id).then((status) =>
        setStatuses((current) => ({ ...current, [provider.id]: status })),
      );
  }, []);
  useEffect(probe, [probe]);

  const ready = AGENTS.filter((p) => statuses[p.id]?.installed && !statuses[p.id]?.reason);
  const chosen = AGENTS.find((p) => p.defaultModel === defaultModel);
  const status =
    Object.keys(statuses).length < AGENTS.length
      ? 'Looking on this computer…'
      : chosen
        ? `${chosen.name} for new Cruxes`
        : ready.length
          ? `Found ${ready.map((p) => p.name).join(' and ')}`
          : 'None found on this computer';

  return (
    <SetupSection
      id="agents"
      title="Coding agents"
      status={status}
      ready={!!chosen || ready.length > 0}
      checking={Object.keys(statuses).length < AGENTS.length}
      open={open}
      onOpen={onOpen}
      onLater={onLater}
    >
      <p className="text-xs text-text-muted">
        Already use Claude Code or Codex? They can work in your Crux with your own sign-in. No key
        is stored here.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {AGENTS.map((provider) => {
          const agent = statuses[provider.id];
          const usable = !!agent?.installed && !agent.reason;
          return (
            <li
              key={provider.id}
              className="py-2 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-sm text-text">{provider.name}</div>
                <div
                  className="text-xs text-text-muted"
                  data-testid={`setup-${provider.id}-status`}
                >
                  {!agent
                    ? 'Looking…'
                    : usable
                      ? `Installed${agent.version ? ` · ${agent.version}` : ''} · signed in with your own account`
                      : (agent.reason ?? `Not installed`)}
                </div>
              </div>
              {usable ? (
                provider.defaultModel === defaultModel ? (
                  <span className="text-xs text-accent">Default for new Cruxes</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() =>
                      void setDefaultModel(provider.defaultModel).then(() => set({ aiUsed: true }))
                    }
                  >
                    Use for new Cruxes
                  </Button>
                )
              ) : (
                <Button variant="ghost" size="xs" onClick={() => void openWeb(provider.keyUrl)}>
                  Get {provider.name}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" size="xs" className="self-start" onClick={probe}>
        Check again
      </Button>
    </SetupSection>
  );
}

const windows = () => typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

/** Your own agent from outside: whole-garden Agent access, the `crux` command, PATH, MCP config. */
export function OutsideAgentSection({ open, onOpen, onLater }: SectionProps) {
  const set = useSetupWizard((s) => s.set);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cli, setCli] = useState<{ path: string } | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);
  useEffect(() => {
    const bridge = window.electronAPI!.agentHost;
    let live = true;
    void bridge
      .listConnections()
      .then((list) => {
        if (live) setConnectionCount(list.length);
      })
      .catch(() => {});
    const off = bridge.onConnectionsChanged((list) => setConnectionCount(list.length));
    return () => {
      live = false;
      off();
    };
  }, []);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupSection
      id="outside"
      title="Your own agent from outside"
      status={
        connectionCount
          ? `${connectionCount} connection${connectionCount === 1 ? '' : 's'} ready`
          : 'No connections yet'
      }
      ready={connectionCount > 0}
      open={open}
      onOpen={onOpen}
      onLater={onLater}
    >
      <p className="text-xs text-text-muted">
        For people who use an agent in a terminal or editor: let it list, open and change your
        Cruxes. Publishing and deleting files still ask you first.
      </p>
      <AgentConnections onReady={() => set({ aiUsed: true })} />

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text">The crux command</span>
          <Button
            variant="secondary"
            size="xs"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await window.electronAPI!.agentHost.installCli();
                setCli({ path: result.path });
                toast('The crux command is installed.');
              })
            }
          >
            {cli ? 'Install again' : 'Install crux command'}
          </Button>
        </div>
        {cli && (
          <p role="status" className="text-xs text-text-muted break-all">
            Installed at <code className="font-mono text-text">{cli.path}</code>
          </p>
        )}
        <p className="text-xs text-text-muted">
          It goes in <code className="font-mono">~/.local/bin</code>. If your terminal says
          &ldquo;command not found&rdquo;, add that folder to your PATH once, then open a new
          terminal and run <code className="font-mono">crux help</code>.
        </p>
        {windows() ? (
          <PathLine label="PowerShell" line={WINDOWS_PATH_LINE} />
        ) : (
          <>
            <PathLine label="zsh (macOS)" line={pathLine('zsh')} />
            <PathLine label="bash" line={pathLine('bash')} />
          </>
        )}
        {!windows() && (
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer w-fit hover:text-text">On Windows</summary>
            <p className="my-1">
              The command is <code className="font-mono">crux.cmd</code> in the same folder. Run
              this once in PowerShell, then open a new terminal:
            </p>
            <PathLine label="PowerShell" line={WINDOWS_PATH_LINE} />
          </details>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </SetupSection>
  );
}

function PathLine({ label, line }: { label: string; line: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">{label}</span>
        <CopyButton text={line} label={`Copy the ${label} line`} />
      </div>
      <pre className="text-2xs font-mono leading-relaxed bg-code-block border border-code-block-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-text">
        {line}
      </pre>
    </div>
  );
}
