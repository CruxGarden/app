import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

export interface AgentProviderDeps {
  sendEvent(runId: string, event: AgentEvent): void;
  /** False when there is no window to ask — the permission is then denied. */
  sendPermission(request: AgentPermissionRequest): boolean;
  log(message: string): void;
  version: string;
  mock: boolean;
}

interface Run {
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
export function findClaudeBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.CRUX_CLAUDE_PATH;
  if (override && fs.existsSync(override)) return override;
  const home = os.homedir();
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
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
  return null;
}

export class AgentProvider {
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
    const version = await new Promise<string | null>((resolve) => {
      const child = execFile(
        bin,
        ['--version'],
        { env: { ...process.env, PATH: agentPath() }, timeout: 8000 },
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
    const emit = (event: AgentEvent) => this.deps.sendEvent(opts.runId, event);
    try {
      const stream = this.deps.mock ? this.mockQuery(opts, run) : await this.sdkQuery(opts, run);
      for await (const msg of stream) {
        if (controller.signal.aborted) break;
        for (const event of mapSdkMessage(msg, state)) emit(event);
      }
      if (!state.text && !controller.signal.aborted && this.runs.has(opts.runId)) {
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
      this.ensureDone(state, emit);
    } finally {
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
    const query = sdk.query({
      prompt: opts.prompt,
      options: {
        cwd: opts.cwd,
        resume: opts.sessionId || undefined,
        pathToClaudeCodeExecutable: status.path,
        // Edits inside the Project Folder are the point; Growth keeps every
        // version. Bash and anything outside the folder still ask.
        permissionMode: 'acceptEdits',
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

  // ── The scripted runtime (e2e) ───────────────────────────────────────

  /**
   * Speaks the SDK's message shapes so the mapper is exercised end to end:
   * a session, streamed text, a Write that really lands in the folder, a
   * Bash that asks permission when the prompt says "run", a result with a cost.
   */
  private async *mockQuery(opts: AgentStartOptions, run: Run): AsyncGenerator<unknown> {
    const sessionId = opts.sessionId || randomUUID();
    const resumed = !!opts.sessionId;
    const say = (text: string) => ({
      type: 'stream_event',
      parent_tool_use_id: null,
      session_id: sessionId,
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    });
    yield {
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      model: 'claude-mock',
      claude_code_version: 'mock',
      cwd: opts.cwd,
      tools: ['Read', 'Write', 'Bash'],
    };
    yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } };
    yield say(resumed ? 'Resuming our session. ' : 'Starting fresh. ');
    yield say('Planting a note in the folder.');
    const file = path.join(opts.cwd, 'agent-note.md');
    const content = `# Agent note\n\n${opts.prompt}\n`;
    yield {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool-write-1',
            name: 'Write',
            input: { file_path: file, content },
          },
        ],
      },
    };
    fs.writeFileSync(file, content);
    yield {
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-write-1',
            content: `File created successfully at: ${file}`,
          },
        ],
      },
    };
    if (/\brun\b/i.test(opts.prompt)) {
      const input = { command: 'echo hello from claude code' };
      yield {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-bash-1', name: 'Bash', input }],
        },
      };
      const allow = await this.askPermission(opts, 'Bash', input);
      if (run.controller.signal.aborted) return;
      yield {
        type: 'user',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [
            allow
              ? {
                  type: 'tool_result',
                  tool_use_id: 'tool-bash-1',
                  content: 'hello from claude code',
                }
              : {
                  type: 'tool_result',
                  tool_use_id: 'tool-bash-1',
                  is_error: true,
                  content: 'The person declined this in Crux Garden.',
                },
          ],
        },
      };
      yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } };
      yield say(allow ? ' The command ran.' : ' Skipped the command, as you asked.');
    }
    yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } };
    yield say(' Done — the note is in agent-note.md.');
    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_ms: 1234,
      num_turns: 2,
      total_cost_usd: 0.0042,
      usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 900 },
      session_id: sessionId,
      result: 'Done',
    };
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
