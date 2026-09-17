import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AgentStartOptions, AgentStatus } from './bridge';
import { agentPath } from './agent-provider';
import { type AgentRuntime, type AgentRuntimeDeps, GARDEN_TOOL_SPECS } from './agent-runtime';
import { CodexConnection } from './codex-connection';
import { mapCodexNotification, newCodexState } from './codex-events';

export function findCodexBinary(): string | null {
  const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const override = process.env.CRUX_CODEX_PATH;
  if (override) return fs.existsSync(override) ? override : null;
  const candidates = [
    ...agentPath()
      .split(path.delimiter)
      .map((dir) => path.join(dir, exe)),
    '/Applications/Codex.app/Contents/Resources/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    path.join(os.homedir(), 'Applications/Codex.app/Contents/Resources/codex'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

interface Run {
  connection: CodexConnection | null;
  controller: AbortController;
  threadId?: string;
  turnId?: string;
}
export class CodexProvider implements AgentRuntime {
  readonly id = 'codex';
  private runs = new Map<string, Run>();
  private permissions = new Map<string, (allow: boolean) => void>();
  private statusCache: { time: number; value: AgentStatus } | null = null;
  constructor(private deps: AgentRuntimeDeps) {}
  private connect(binary: string, cwd: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: agentPath() };
    delete env.ELECTRON_RUN_AS_NODE;
    return new CodexConnection(binary, cwd, env);
  }
  private async initialize(connection: CodexConnection): Promise<void> {
    await connection.request(
      'initialize',
      {
        clientInfo: { name: 'crux_garden', title: 'Crux Garden', version: this.deps.version },
        capabilities: { experimentalApi: true },
      },
      15_000,
    );
    connection.notify('initialized');
  }
  async status(force = false): Promise<AgentStatus> {
    if (!force && this.statusCache && Date.now() - this.statusCache.time < 30_000)
      return this.statusCache.value;
    const binary = findCodexBinary();
    if (!binary)
      return {
        installed: false,
        path: null,
        version: null,
        reason: 'Codex is not installed. Install Codex and run codex login.',
      };
    let connection: CodexConnection | undefined;
    let version: string | null = null;
    let reason: string | null = null;
    try {
      version = await new Promise<string>((resolve, reject) =>
        execFile(binary, ['--version'], { timeout: 5000 }, (error, stdout) =>
          error ? reject(error) : resolve(stdout.trim()),
        ),
      );
      connection = this.connect(binary, os.tmpdir());
      await this.initialize(connection);
      const account = await connection.request('account/read', { refreshToken: false }, 15_000);
      if (!account.account && account.requiresOpenaiAuth !== false)
        reason = 'Codex is installed but not signed in. Run codex login, then retry.';
    } catch (error) {
      reason = `Codex is unavailable: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await connection?.close();
    }
    const value = { installed: true, path: binary, version, reason };
    this.statusCache = { time: Date.now(), value };
    return value;
  }
  async start(options: AgentStartOptions): Promise<void> {
    const run: Run = { connection: null, controller: new AbortController() };
    this.runs.set(options.runId, run);
    const state = newCodexState();
    const emit = (event: Parameters<AgentRuntimeDeps['sendEvent']>[1]) =>
      this.deps.sendEvent(options.runId, event);
    const start = Date.now();
    let finish: (() => void) | undefined;
    try {
      const status = await this.status();
      if (run.controller.signal.aborted) return;
      if (!status.path || status.reason) throw new Error(status.reason ?? 'Codex is unavailable.');
      const connection = this.connect(status.path, options.cwd);
      run.connection = connection;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      connection.onClose = (error) => {
        if (!run.controller.signal.aborted) emit({ type: 'error', message: error.message });
        finish?.();
      };
      connection.onNotification = (method, params) => {
        if (!run.threadId || params.threadId !== run.threadId) return;
        if (params.turnId && run.turnId && params.turnId !== run.turnId) return;
        // Interrupt can race with a declined approval's final notifications.
        // Keep the saved partial state, but do not accept more output after Stop.
        if (run.controller.signal.aborted) {
          if (method === 'turn/completed') finish?.();
          return;
        }
        if (method === 'turn/started') run.turnId = params.turn.id;
        if (method === 'thread/tokenUsage/updated' && (!run.turnId || params.turnId !== run.turnId))
          return;
        for (const event of mapCodexNotification(method, params, state)) emit(event);
        if (method === 'turn/completed' && (!run.turnId || params.turn.id === run.turnId)) {
          if (params.turn.status === 'failed')
            emit({ type: 'error', message: params.turn.error?.message ?? 'Codex turn failed.' });
          finish?.();
        }
      };
      connection.onRequest = async (method, params) => {
        if (
          run.controller.signal.aborted ||
          params.threadId !== run.threadId ||
          (run.turnId && params.turnId && params.turnId !== run.turnId)
        )
          throw new Error('The originating Garden turn is no longer active.');
        if (method === 'item/tool/call') {
          if (!GARDEN_TOOL_SPECS.some((tool) => tool.name === params.tool))
            throw new Error('Unknown Garden tool.');
          const result = await this.deps.callTool(
            options,
            params.tool,
            params.arguments ?? {},
            run.controller.signal,
          );
          state.hadMutation ||= result.hadMutation === true;
          return {
            success: !result.isError,
            contentItems: result.content.map((part) =>
              part.type === 'text'
                ? { type: 'inputText', text: part.text }
                : { type: 'inputImage', imageUrl: `data:${part.mimeType};base64,${part.data}` },
            ),
          };
        }
        if (
          method === 'item/commandExecution/requestApproval' ||
          method === 'item/fileChange/requestApproval'
        ) {
          const allow = await this.ask(options, run, method, params);
          return { decision: allow && !run.controller.signal.aborted ? 'accept' : 'decline' };
        }
        // Never guess a person's answer, grant session-wide permission, or accept OAuth on their behalf.
        emit({
          type: 'error',
          message: `Codex requested ${method}, which Garden cannot present yet. Continue setup in Codex or answer in Collaboration and retry.`,
        });
        void this.interrupt(options.runId);
        throw new Error('Unsupported interaction in this Garden adapter. No approval was granted.');
      };
      await this.initialize(connection);
      const common = {
        cwd: options.cwd,
        sandbox: 'workspace-write',
        approvalPolicy: 'on-request',
        developerInstructions: [
          options.appendSystemPrompt,
          "You are collaborating inside Crux Garden. Discover its App Tools with garden_search_tools and execute them with garden_call_tool. Inspect the current saved state before editing; preserve the person's work. Garden owns Collaboration and Growth. Ask ordinary questions in your assistant messages.",
        ]
          .filter(Boolean)
          .join('\n\n'),
      };
      const response = options.sessionId
        ? await connection.request('thread/resume', { ...common, threadId: options.sessionId })
        : await connection.request('thread/start', {
            ...common,
            dynamicTools: GARDEN_TOOL_SPECS.map((tool) => ({ type: 'function', ...tool })),
          });
      if (run.controller.signal.aborted) return;
      run.threadId = response.thread.id;
      emit({
        type: 'session',
        sessionId: run.threadId!,
        model: response.model ?? '',
        version: status.version ?? '',
      });
      const started = await connection.request('turn/start', {
        threadId: run.threadId,
        input: [{ type: 'text', text: options.prompt }],
      });
      run.turnId = started.turn.id;
      await done;
      if (state.usage) emit({ type: 'usage', ...state.usage });
      emit({
        type: 'info',
        message: `Codex · ${((Date.now() - start) / 1000).toFixed(1)}s · billed by your Codex account; cost not reported`,
      });
    } catch (error) {
      if (!run.controller.signal.aborted)
        emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      run.controller.abort();
      // Closing our own process also stops its managed commands; never touch the user's Codex app daemon.
      if (run.connection) {
        run.connection.onClose = () => {};
        await run.connection.close();
      }
      this.runs.delete(options.runId);
      emit({ type: 'done', textContent: state.text, hadMutation: state.hadMutation });
    }
  }
  private ask(options: AgentStartOptions, run: Run, method: string, params: any): Promise<boolean> {
    const requestId = `codex:${randomUUID()}`;
    return new Promise((resolve) => {
      const finish = (allow: boolean) => {
        clearTimeout(timer);
        run.controller.signal.removeEventListener('abort', abort);
        this.permissions.delete(requestId);
        resolve(allow);
      };
      const abort = () => finish(false);
      const timer = setTimeout(abort, 10 * 60_000);
      this.permissions.set(requestId, finish);
      run.controller.signal.addEventListener('abort', abort, { once: true });
      const toolName = method.includes('commandExecution') ? 'Bash' : 'Edit';
      const summary =
        [params.command, params.reason, params.grantRoot].filter(Boolean).join('\n') ||
        'Codex requests permission for this action.';
      if (
        !this.deps.sendPermission({
          requestId,
          runId: options.runId,
          cruxId: options.cruxId,
          toolName,
          input: params,
          summary,
        })
      )
        finish(false);
    });
  }
  answer(requestId: string, allow: boolean): void {
    this.permissions.get(requestId)?.(allow);
  }
  async interrupt(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.controller.abort();
    if (run.connection && run.threadId && run.turnId)
      await run.connection
        .request('turn/interrupt', { threadId: run.threadId, turnId: run.turnId }, 2000)
        .catch(() => {});
    await run.connection?.close();
  }
  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.keys()].map((runId) => this.interrupt(runId)));
  }
}
