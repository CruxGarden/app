import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GARDEN_TOOL_SPECS, type AgentRuntimeDeps } from './agent-runtime';
import {
  mapSdkMessage,
  newMapperState,
  describeToolUse,
  type AgentEvent,
  type MapperState,
} from './agent-events';

/**
 * Agent Provider (ADR 0019): Claude Code as a Collaboration provider.
 *
 * The Claude Agent SDK runs here, in the Electron main process, driving the
 * person's OWN Claude Code install (the native `claude` binary — the SDK does
 * not bundle one) in the crux's Project Folder. Their Claude Code login pays
 * for the turns; Crux Garden never sees a key or a token. One SDK session per
 * crux, resumed across turns by the session id the renderer keeps in crux meta.
 *
 * Every SDK message is mapped (`agent-events.ts`) to the engine's event shape
 * and streamed to the renderer over `agent:event`, where the ordinary
 * Background Turn machinery renders it. Permissions the SDK asks about
 * (Bash, anything outside the folder — edits inside are auto-accepted, Growth
 * is the net) go to the renderer as `agent:permission` and come back through
 * `answer()`; the pane shows the same approval banner MCP callers get.
 *
 * `CRUX_AGENT_MOCK=1` swaps the SDK for a scripted runtime so the e2e suite
 * can drive the whole path without Claude Code installed.
 */

export interface AgentStatus {
  /** A `claude` binary was found (or the mock is on). */
  installed: boolean;
  path: string | null;
  version: string | null;
  /** Why it is unavailable, when it is. */
  reason: string | null;
}

export interface AgentStartOptions {
  provider?: string;
  runId: string;
  cruxId: string;
  cwd: string;
  prompt: string;
  /** SDK session to resume; omitted on a crux's first turn. */
  sessionId?: string | null;
  /** The persona's system prompt, appended to Claude Code's own. */
  appendSystemPrompt?: string;
}

export interface AgentPermissionRequest {
  requestId: string;
  runId: string;
  cruxId: string;
  toolName: string;
  input: Record<string, unknown>;
  summary: string;
}

export type AgentProviderDeps = AgentRuntimeDeps;

interface Run {
  toolMutation?: boolean;
  controller: AbortController;
  query: { interrupt(): Promise<unknown> } | null;
}

const PERMISSION_TIMEOUT_MS = 10 * 60 * 1000;

/** Import an ESM package from this CommonJS module without tsc rewriting it to require(). */
const importEsm = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

/** Where a Finder-launched app cannot see, but a terminal can. */
export function agentPath(): string {
  const home = os.homedir();
  const extra = [
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
  ];
  const current = (process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(path.delimiter);
  return [...extra.filter((p) => !current.includes(p)), ...current].join(path.delimiter);
}

/** Find the person's Claude Code binary. `CRUX_CLAUDE_PATH` wins; then the usual homes. */
function findClaudeBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.CRUX_CLAUDE_PATH;
  if (override && fs.existsSync(override)) return override;
  const home = os.homedir();
  const windows = process.platform === 'win32';
  const exe = windows ? 'claude.exe' : 'claude';
  const candidates = [
    path.join(home, '.local', 'bin', exe),
    path.join(home, '.claude', 'local', exe),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(home, '.npm-global', 'bin', exe),
    path.join(home, '.bun', 'bin', exe),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const dir of agentPath().split(path.delimiter)) {
    const c = path.join(dir, exe);
    if (dir && fs.existsSync(c)) return c;
  }
  // On Windows an npm install leaves `claude.cmd`, a batch shim the SDK cannot
  // spawn as an executable. What it wants is the package's own entry point, so
  // follow the shim to the module and hand over `cli.js`.
  if (windows) {
    for (const dir of agentPath().split(path.delimiter)) {
      if (!dir) continue;
      const shim = path.join(dir, 'claude.cmd');
      if (!fs.existsSync(shim)) continue;
      const entry = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      if (fs.existsSync(entry)) return entry;
    }
  }
  return null;
}

export class AgentProvider {
  readonly id = 'claude-code';
  private runs = new Map<string, Run>();
  private pending = new Map<
    string,
    { resolve: (allow: boolean) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private statusCache: AgentStatus | null = null;

  constructor(private deps: AgentProviderDeps) {}

  // ── Status ───────────────────────────────────────────────────────────

  async status(force = false): Promise<AgentStatus> {
    if (this.deps.mock) {
      return { installed: true, path: 'mock', version: 'mock', reason: null };
    }
    if (this.statusCache && !force) return this.statusCache;
    const bin = findClaudeBinary();
    if (!bin) {
      this.statusCache = {
        installed: false,
        path: null,
        version: null,
        reason: 'Claude Code is not installed on this machine.',
      };
      return this.statusCache;
    }
    // A `.js` entry point is a module, not an executable — run it through
    // this app's own Node, the way pnpm is run (see pnpm.ts).
    const asModule = bin.toLowerCase().endsWith('.js');
    const version = await new Promise<string | null>((resolve) => {
      const child = execFile(
        asModule ? process.execPath : bin,
        asModule ? [bin, '--version'] : ['--version'],
        {
          env: {
            ...process.env,
            PATH: agentPath(),
            ...(asModule ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
          },
          timeout: 8000,
        },
        (err, stdout) => resolve(err ? null : String(stdout).trim() || null),
      );
      child.on('error', () => resolve(null));
    });
    this.statusCache = { installed: true, path: bin, version, reason: null };
    return this.statusCache;
  }

  // ── Turns ────────────────────────────────────────────────────────────

  /** Start a turn. Resolves when the SDK stream ends; events go out as they arrive. */
  async start(opts: AgentStartOptions): Promise<void> {
    const controller = new AbortController();
    const run: Run = { controller, query: null };
    this.runs.set(opts.runId, run);
    const state = newMapperState();
    let doneSent = false;
    const emit = (event: AgentEvent) => this.deps.sendEvent(opts.runId, event);
    try {
      const stream = this.deps.mock ? this.mockQuery(opts, run) : await this.sdkQuery(opts, run);
      for await (const msg of stream) {
        if (controller.signal.aborted) break;
        state.hadMutation ||= run.toolMutation === true;
        // The MCP servers the agent actually got — the garden's own above all.
        // Logged because "the crux_garden server is not in this session" was
        // otherwise invisible from outside (MAKING-IT-POSSIBLE-STEPS, step 2).
        {
          const sys = msg as { type?: string; subtype?: string; mcp_servers?: unknown };
          if (sys?.type === 'system' && sys.subtype === 'init')
            this.deps.log(`[claude-code] mcp servers: ${JSON.stringify(sys.mcp_servers ?? [])}`);
        }
        for (const event of mapSdkMessage(msg, state)) {
          if (event.type === 'done') doneSent = true;
          emit(event);
        }
      }
      if (!doneSent) {
        // The stream ended without a result message (interrupted early, or a
        // spawn failure the SDK reported on stderr only): close the turn out.
        this.ensureDone(state, emit);
      }
    } catch (err) {
      const e = err as Error;
      if (e?.name !== 'AbortError' && !controller.signal.aborted) {
        this.deps.log(`Agent Provider run ${opts.runId} failed: ${e?.stack || e}`);
        emit({ type: 'error', message: friendlyError(e) });
      }
      state.hadMutation ||= run.toolMutation === true;
      if (!doneSent) this.ensureDone(state, emit);
    } finally {
      run.controller.abort();
      this.runs.delete(opts.runId);
    }
  }

  private ensureDone(state: MapperState, emit: (e: AgentEvent) => void) {
    emit({ type: 'done', textContent: state.text, hadMutation: state.hadMutation });
  }

  /** Stop the turn: the SDK is asked to interrupt, then the stream is abandoned. */
  async interrupt(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.controller.abort();
    try {
      await run.query?.interrupt();
    } catch {
      /* the process may already be gone */
    }
    run.controller.abort();
    // Any permission still waiting belongs to a stopped turn: deny it.
    for (const [id, p] of this.pending) {
      if (id.startsWith(`${runId}:`)) {
        clearTimeout(p.timer);
        p.resolve(false);
        this.pending.delete(id);
      }
    }
  }

  answer(requestId: string, allow: boolean): void {
    const p = this.pending.get(requestId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(requestId);
    p.resolve(allow);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.keys()].map((id) => this.interrupt(id)));
  }

  /** Ask the person, through the renderer's approval banner. */
  private askPermission(
    opts: AgentStartOptions,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<boolean> {
    const requestId = `${opts.runId}:${randomUUID()}`;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(false);
      }, PERMISSION_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, timer });
      const sent = this.deps.sendPermission({
        requestId,
        runId: opts.runId,
        cruxId: opts.cruxId,
        toolName,
        input,
        summary: describeToolUse(toolName, input),
      });
      if (!sent) this.answer(requestId, false);
    });
  }

  // ── The real thing ───────────────────────────────────────────────────

  private async sdkQuery(opts: AgentStartOptions, run: Run): Promise<AsyncIterable<unknown>> {
    const status = await this.status();
    if (!status.installed || !status.path) {
      throw new Error(status.reason || 'Claude Code is not installed on this machine.');
    }
    const sdk = await importEsm('@anthropic-ai/claude-agent-sdk');
    const schemas = [
      z.object({ query: z.string(), offset: z.number().int().nonnegative().optional() }),
      // Not z.record: with zod 4 the SDK cannot serialize it, and the server
      // then connects with an EMPTY tool list — silently. Found 2026-09-20
      // (MAKING-IT-POSSIBLE-STEPS, step 2): the agent in the pane never had
      // a single garden tool. A loose object serializes.
      z.object({ name: z.string(), input: z.looseObject({}) }),
    ];
    const garden = sdk.createSdkMcpServer({
      name: 'crux_garden',
      version: this.deps.version,
      tools: GARDEN_TOOL_SPECS.map((tool, index) =>
        sdk.tool(
          tool.name,
          tool.description,
          schemas[index]!.shape,
          async (input: Record<string, unknown>) => {
            const result = await this.deps.callTool(opts, tool.name, input, run.controller.signal);
            run.toolMutation ||= result.hadMutation === true;
            return { content: result.content, isError: result.isError };
          },
        ),
      ),
    });
    const query = sdk.query({
      prompt: opts.prompt,
      options: {
        cwd: opts.cwd,
        mcpServers: { crux_garden: garden },
        resume: opts.sessionId || undefined,
        pathToClaudeCodeExecutable: status.path,
        // Edits inside the Project Folder are the point; Growth keeps every
        // version. Bash and anything outside the folder still ask.
        permissionMode: 'acceptEdits',
        // The garden's own two tools need no click: discovery is harmless and
        // every tool behind garden_call_tool keeps its own in-app approval
        // (delete, publish) — the same rule as acceptEdits for the folder.
        allowedTools: [
          'mcp__crux_garden__garden_search_tools',
          'mcp__crux_garden__garden_call_tool',
        ],
        includePartialMessages: true,
        persistSession: true,
        settingSources: ['user', 'project'],
        systemPrompt: opts.appendSystemPrompt
          ? { type: 'preset', preset: 'claude_code', append: opts.appendSystemPrompt }
          : { type: 'preset', preset: 'claude_code' },
        abortController: run.controller,
        canUseTool: async (toolName: string, input: Record<string, unknown>) => {
          const allow = await this.askPermission(opts, toolName, input);
          return allow
            ? { behavior: 'allow', updatedInput: input }
            : {
                behavior: 'deny',
                message: 'The person declined this in Crux Garden. Do not retry unless they ask.',
              };
        },
        env: {
          ...process.env,
          PATH: agentPath(),
          CLAUDE_AGENT_SDK_CLIENT_APP: `crux-garden/${this.deps.version}`,
        },
        stderr: (data: string) => this.deps.log(`[claude-code] ${data.trimEnd()}`),
      },
    });
    run.query = query;
    return query as AsyncIterable<unknown>;
  }

  /** Development fixture lives outside the packaged production sources. */
  private mockQuery(opts: AgentStartOptions, run: Run): AsyncGenerator<unknown> {
    const { scriptedQuery } = require('../e2e/agent-mock.cjs');
    return scriptedQuery(
      opts,
      run.controller.signal,
      (name: string, input: Record<string, unknown>) => this.askPermission(opts, name, input),
    );
  }
}

function friendlyError(e: Error): string {
  const msg = e?.message || String(e);
  if (/not installed|executable not found|ENOENT/i.test(msg))
    return 'Claude Code is not installed on this machine. Install it, then pick Claude Code again.';
  if (/not logged in|login|authenticat|invalid api key|401/i.test(msg))
    return 'Claude Code is not signed in. Run `claude` in a terminal once to sign in, then try again.';
  return msg;
}
