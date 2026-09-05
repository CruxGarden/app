/**
 * Agent Host — renderer side (ADR 0013).
 *
 * The Electron main process hosts one MCP server per switched-on crux and
 * forwards every `tools/list`, `tools/call` and `resources/read` here. This
 * module answers them with the SAME machinery the built-in collaborator uses:
 * `createToolExecutor` (one implementation of write_file, one read-before-
 * write rule, one delete-approval banner), the Collaboration transcript
 * (every external call is recorded as a tool message stamped with the agent's
 * name), and Growth (snapshots it takes carry `requestedBy: 'agent:<name>'`).
 *
 * Three tools exist only here because they are product actions, not file
 * actions: `publish`, `unpublish` (both wait for the person's approval in the
 * app) and `get_usage`.
 *
 * The crux must be OPEN in the app for a call to run — the executor, the
 * transcript and the approval banners all belong to the open workspace.
 */

import {
  createToolExecutor,
  defaultToolDefinitions,
  didMutate,
  type ToolDefinition,
} from '@/ai/tools';
import { resolveModel } from '@/ai/providers';
import type { ChatMessage, ToolCall } from '@/api/types';
import * as usageApi from '@/api/usage';
import { pathOf } from '@/lib/artifact-path';
import type { AgentHostRequest, AgentHostServer } from '@/lib/platform';
import { publicCruxUrl } from '@/lib/public-url';
import { getServices } from '@/services';
import { chatSessionFor } from '@/services/chat-session';
import type { SnapshotFrequency } from '@/services/growth';
import { getPersona, getPersonaFingerprint } from '@/services/persona';
import { startPreviewServer } from '@/services/preview-server';
import { folderForCrux } from '@/services/project-folder';
import { isInternalArtifactPath } from '@/services/publish';
import type { ToolResultContent } from '@/services/types';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { useCruxStore } from '@/stores/cruxStore';
import { cancelPendingAgentApprovals, useUIStore } from '@/stores/uiStore';

// ── Tool surface ─────────────────────────────────────────────────────────────

const NO_INPUT = {
  type: 'object' as const,
  properties: {},
  required: [] as string[],
  additionalProperties: false,
};

/** Product actions offered to external agents on top of the collaborator's tools. */
export const HOST_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'publish',
    description:
      'Publish this crux to crux.garden (a Site Crux is built first). The person must approve the ' +
      'publish in Crux Garden before it runs — the call waits for their answer. Returns the public URL. ' +
      'USE WHEN: The person asked for the work to go live.',
    input_schema: NO_INPUT,
  },
  {
    name: 'unpublish',
    description:
      'Take this crux offline at crux.garden. The person must approve it in Crux Garden first — the ' +
      'call waits for their answer.',
    input_schema: NO_INPUT,
  },
  {
    name: 'get_usage',
    description:
      "Storage, bandwidth and Crux Store usage for this crux and for the connected account's billing " +
      'period, against the plan limits. Needs a connected crux.garden account.',
    input_schema: NO_INPUT,
  },
];

const HOST_TOOL_NAMES = new Set(HOST_TOOL_DEFINITIONS.map((t) => t.name));

/** Everything an external agent can call: the collaborator's tools (files, search, check_site, Growth, theme, resonance) plus the product actions. */
export function agentToolDefinitions(): ToolDefinition[] {
  // An external agent brings its own subagents; ours run only from the
  // Collaboration pane (B5), so `delegate` is not offered over MCP.
  return [
    ...defaultToolDefinitions().filter((t) => t.name !== 'delegate'),
    ...HOST_TOOL_DEFINITIONS,
  ];
}

/** `requestedBy` stamp for Growth and the transcript's `model` badge. */
export function agentActor(agent: string): string {
  return `agent:${agent}`;
}

// ── Connect snippets (Settings → Agents) ─────────────────────────────────────

export interface ConnectSnippets {
  claudeCode: string;
  codex: string;
  cursor: string;
  stdio: string;
}

export function serverKey(slug: string): string {
  return `crux-${slug}`;
}

/** Copy-ready configuration for the common clients. Pure — also used by the e2e gate. */
export function connectSnippets(
  server: Pick<AgentHostServer, 'slug' | 'url' | 'token' | 'stdioCommand'>,
): ConnectSnippets {
  const key = serverKey(server.slug);
  const bearer = `Bearer ${server.token}`;
  return {
    claudeCode: `claude mcp add --transport http ${key} ${server.url} --header "Authorization: ${bearer}"`,
    codex: [
      `[mcp_servers.${key}]`,
      `url = "${server.url}"`,
      `http_headers = { Authorization = "${bearer}" }`,
    ].join('\n'),
    cursor: JSON.stringify(
      { mcpServers: { [key]: { url: server.url, headers: { Authorization: bearer } } } },
      null,
      2,
    ),
    stdio: server.stdioCommand,
  };
}

// ── Enable / disable (Settings → Agents) ─────────────────────────────────────

function hostBridge() {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.agentHost ?? null;
}

/**
 * Remember the switch on the crux itself (`meta.settings.agentHost`) so main
 * brings the server back on the next launch. For the OPEN crux the store's
 * meta is the truth — writing the row directly would be undone by the next
 * saveMeta.
 */
async function persistAgentHostFlag(cruxId: string, on: boolean): Promise<void> {
  const store = useCruxStore.getState();
  if (store.crux?.id === cruxId) {
    store.patchCruxMeta({ settings: { ...store.crux.meta?.settings, agentHost: on } });
    await store.saveMeta();
    return;
  }
  const { crux: cruxService } = getServices();
  const crux = await cruxService.findById(cruxId);
  await cruxService.update(cruxId, {
    meta: { ...crux.meta, settings: { ...crux.meta?.settings, agentHost: on } },
  });
}

export const agentHost = {
  async list(): Promise<AgentHostServer[]> {
    const api = hostBridge();
    if (!api) return [];
    try {
      return await api.list();
    } catch {
      return [];
    }
  },
  async enable(cruxId: string): Promise<AgentHostServer | null> {
    const api = hostBridge();
    if (!api) return null;
    const server = await api.enable(cruxId);
    await persistAgentHostFlag(cruxId, true);
    return server;
  },
  async disable(cruxId: string): Promise<void> {
    const api = hostBridge();
    if (!api) return;
    await api.disable(cruxId);
    await persistAgentHostFlag(cruxId, false);
  },
  async regenerate(cruxId: string): Promise<AgentHostServer | null> {
    const api = hostBridge();
    if (!api) return null;
    return api.regenerate(cruxId);
  },
  onChanged(cb: (servers: AgentHostServer[]) => void): () => void {
    return hostBridge()?.onChanged(cb) ?? (() => {});
  },
};

// ── Request handling ─────────────────────────────────────────────────────────

/** MCP `CallToolResult` as the main process passes it through. */
interface McpToolResult {
  content: Array<
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
}

interface McpResourceResult {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

let stopListener: (() => void) | null = null;
// One executor per (crux, agent): read-before-write tracking is per agent
// session, like it is per conversation for the built-in collaborator.
const executors = new Map<string, ReturnType<typeof createToolExecutor>>();

/**
 * Start answering forwarded MCP requests. Called once from the app bootstrap
 * in Desktop Mode; idempotent. Returns a stop function.
 */
export function startAgentHostListener(): () => void {
  if (stopListener) return stopListener;
  const api = hostBridge();
  if (!api) return () => {};

  const offRequest = api.onRequest((request) => {
    handleRequest(request).then(
      (result) => api.respond({ id: request.id, result }),
      (err: unknown) => api.respond({ id: request.id, error: errorMessage(err) }),
    );
  });
  // Switching cruxes tears down the workspace the pending approvals belonged to.
  const offStore = useCruxStore.subscribe((s, prev) => {
    if (s.crux?.id !== prev.crux?.id) {
      cancelPendingAgentApprovals();
      executors.clear();
    }
  });

  stopListener = () => {
    offRequest();
    offStore();
    stopListener = null;
  };
  return stopListener;
}

async function handleRequest(request: AgentHostRequest): Promise<unknown> {
  switch (request.kind) {
    case 'tools/list':
      return agentToolDefinitions();
    case 'tools/call':
      return callTool(request);
    case 'resources/read':
      return readResource(request);
  }
}

function notOpenMessage(): string {
  return (
    'Error: This crux is not open in Crux Garden. Open it in the app and call again — tools run ' +
    'inside the app so every change shows up in its Collaboration and Growth.'
  );
}

async function callTool(
  request: Extract<AgentHostRequest, { kind: 'tools/call' }>,
): Promise<McpToolResult> {
  const { crux } = useCruxStore.getState();
  if (!crux || crux.id !== request.cruxId) return toMcpResult(notOpenMessage());

  const result = HOST_TOOL_NAMES.has(request.name)
    ? await runHostTool(request)
    : await executorFor(request.cruxId, request.agent)(request.name, request.input);

  // The workspace may have changed while a blocked call (delete approval,
  // publish approval) waited. Never record under the wrong crux.
  if (useCruxStore.getState().crux?.id !== request.cruxId) return toMcpResult(result);

  await recordToolCall(request, result);

  if (didMutate(request.name, result)) {
    await useCruxStore
      .getState()
      .refreshArtifacts()
      .catch((err) => console.error('[agent-host] artifact refresh failed:', err));
    noteMutation(request.cruxId);
  }
  return toMcpResult(result);
}

/**
 * An external agent has no turn boundary — a coding agent makes twenty edits
 * in a row. Treat a quiet spell after the last mutation as the end of its
 * "turn" and hand ONE notification to the same auto-snapshot policy the
 * built-in collaborator uses, instead of a snapshot per write.
 */
const AGENT_TURN_QUIET_MS = 4000;
const mutationTimers = new Map<string, ReturnType<typeof setTimeout>>();

function noteMutation(cruxId: string): void {
  const existing = mutationTimers.get(cruxId);
  if (existing) clearTimeout(existing);
  mutationTimers.set(
    cruxId,
    setTimeout(() => {
      mutationTimers.delete(cruxId);
      if (useCruxStore.getState().crux?.id !== cruxId) return;
      sessionFor(cruxId).policy.notifyMutation();
    }, AGENT_TURN_QUIET_MS),
  );
}

function executorFor(cruxId: string, agent: string) {
  const key = `${cruxId}::${agent}`;
  let exec = executors.get(key);
  if (!exec) {
    const model = resolveModel(useCruxStore.getState().crux?.meta?.settings?.model);
    exec = createToolExecutor(
      cruxId,
      // The same banner the built-in collaborator's deletes wait on: the
      // person approves in the app, never in the agent's terminal.
      (path, artifactId) => useCruxStore.getState().requestDeleteApproval(artifactId, path),
      model,
      { requestedBy: agentActor(agent) },
    );
    executors.set(key, exec);
  }
  return exec;
}

/** The same per-crux session the chat hook uses — so the auto-snapshot policy is shared. */
function sessionFor(cruxId: string) {
  return chatSessionFor(cruxId, {
    frequency: () =>
      (useCruxStore.getState().crux?.meta?.settings?.snapshotFrequency as SnapshotFrequency) ||
      'ai-turn',
    snapshot: () => {
      if (useCruxStore.getState().crux?.id !== cruxId) return;
      useCruxStore
        .getState()
        .createSnapshot({ silent: false })
        .catch((err) => console.warn('Auto-snapshot failed:', err));
    },
  });
}

/** Record the call in the Collaboration as a tool message from the agent. */
async function recordToolCall(
  request: Extract<AgentHostRequest, { kind: 'tools/call' }>,
  result: string | ToolResultContent,
): Promise<void> {
  const toolCall: ToolCall = {
    id: `agent_${request.id}`,
    name: request.name,
    input: request.input,
    result: resultText(result),
  };
  const message: ChatMessage = {
    role: 'assistant',
    content: '',
    // Stamped with the persona so the built-in collaborator sees what the
    // external agent did in its own context, and with the agent for the UI.
    model: agentActor(request.agent),
    agent: request.agent,
    timestamp: new Date().toISOString(),
    toolCalls: [toolCall],
    personaFingerprint: getPersonaFingerprint(getPersona()),
  };
  const store = useCruxStore.getState();
  store.addMessage(message);
  await store.saveMeta();
}

// ── Host tools ───────────────────────────────────────────────────────────────

async function runHostTool(
  request: Extract<AgentHostRequest, { kind: 'tools/call' }>,
): Promise<string> {
  switch (request.name) {
    case 'publish':
      return publishFor(request, 'publish');
    case 'unpublish':
      return publishFor(request, 'unpublish');
    case 'get_usage':
      return getUsage(request.cruxId);
    default:
      return `Error: Unknown tool: ${request.name}`;
  }
}

async function publishFor(
  request: Extract<AgentHostRequest, { kind: 'tools/call' }>,
  action: 'publish' | 'unpublish',
): Promise<string> {
  if (!useAuthStore.getState().isAuthenticated) {
    return 'Error: No crux.garden account is connected. The person can connect one in Crux Garden → Settings → Account.';
  }
  const approved = await useUIStore.getState().requestAgentApproval({
    agent: request.agent,
    action,
    cruxId: request.cruxId,
  });
  if (!approved) {
    return `The user DECLINED the ${action} request. Do not retry unless they ask for it.`;
  }
  const store = useCruxStore.getState();
  if (store.crux?.id !== request.cruxId) return notOpenMessage();

  if (action === 'unpublish') {
    try {
      await store.unpublishCrux();
      return 'Unpublished. The crux is no longer live on crux.garden.';
    } catch (err) {
      return `Error: unpublish failed — ${errorMessage(err)}`;
    }
  }

  const ok = await store.publishCrux();
  if (!ok) {
    const failure = useCruxStore.getState().publishFailure;
    const log = failure?.log ? `\n\nBuild output:\n${failure.log}` : '';
    return `Error: publish failed — ${failure?.message ?? 'unknown error'}${log}`;
  }
  const author = useAppStore.getState().author;
  const slug = useCruxStore.getState().crux?.slug ?? store.crux.slug;
  const url = author ? publicCruxUrl(author.username, slug) : null;
  return url ? `Published. Live at ${url}` : 'Published.';
}

async function getUsage(cruxId: string): Promise<string> {
  if (!useAuthStore.getState().isAuthenticated) {
    return 'Error: No crux.garden account is connected, so there is no usage to report. The person can connect one in Crux Garden → Settings → Account.';
  }
  try {
    const [crux, account] = await Promise.all([usageApi.forCrux(cruxId), usageApi.me()]);
    return JSON.stringify({ crux, account }, null, 2);
  } catch (err) {
    return `Error: usage is unavailable right now — ${errorMessage(err)}`;
  }
}

// ── Resources ────────────────────────────────────────────────────────────────

async function readResource(
  request: Extract<AgentHostRequest, { kind: 'resources/read' }>,
): Promise<McpResourceResult> {
  const { cruxId, uri } = request;
  const json = (value: unknown): McpResourceResult => ({
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
  });
  const { artifact, dimension } = getServices();

  switch (uri) {
    case 'crux://files': {
      const all = await artifact.findByResource('crux', cruxId);
      const files = all
        .filter((a) => a.type === 'artifact' && !isInternalArtifactPath(pathOf(a)))
        .map((a) => ({ path: pathOf(a), size: a.size, mimeType: a.mimeType, updated: a.updated }))
        .sort((a, b) => a.path.localeCompare(b.path));
      return json({ cruxId, files });
    }
    case 'crux://growth': {
      const growths = await dimension.findBySourceAndType(cruxId, 'growth');
      const timeline = growths
        .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
        .map((g) => ({
          id: g.id,
          snapshotCruxId: g.targetId,
          label: (g.meta?.label as string | undefined) ?? null,
          requestedBy: (g.meta?.requestedBy as string | undefined) ?? null,
          created: g.created,
        }));
      return json({ cruxId, snapshots: timeline });
    }
    case 'crux://preview': {
      const folder = await folderForCrux(cruxId);
      const dev = folder ? await window.electronAPI?.devserver.status(folder) : null;
      if (dev?.url) return json({ url: dev.url, kind: 'dev-server', status: dev.status });
      const url = await startPreviewServer(cruxId);
      return json({ url, kind: 'static' });
    }
    case 'crux://persona': {
      const { name, greeting, systemPrompt } = getPersona();
      return json({ name, greeting, systemPrompt });
    }
    case 'crux://agents-md': {
      const all = await artifact.findByResource('crux', cruxId);
      const file = all.find((a) => a.type === 'artifact' && pathOf(a) === 'AGENTS.md');
      const text = file
        ? await artifact.readContent(file.id)
        : '# AGENTS.md\n\nThis crux has no AGENTS.md yet. Read crux://files for the file tree and ' +
          'crux://persona for the collaborator voice; do not touch `_crux/` or `.crux/`.';
      return { contents: [{ uri, mimeType: 'text/markdown', text }] };
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resultText(result: string | ToolResultContent): string {
  if (typeof result === 'string') return result;
  return result
    .map((b) => (b.type === 'text' ? b.text : `[image ${b.source.media_type}]`))
    .join('\n');
}

function toMcpResult(result: string | ToolResultContent): McpToolResult {
  if (typeof result === 'string') {
    return { content: [{ type: 'text', text: result }], isError: result.startsWith('Error') };
  }
  return {
    content: result.map((b) =>
      b.type === 'text'
        ? { type: 'text' as const, text: b.text }
        : { type: 'image' as const, data: b.source.data, mimeType: b.source.media_type },
    ),
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
