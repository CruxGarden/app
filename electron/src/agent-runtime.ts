import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  AgentPermissionRequest,
  AgentStartOptions,
  AgentStatus,
  AgentToolRequest,
  AgentToolResult,
} from './bridge';

/** Runtime adapters translate their native protocol; Garden owns routing and tool execution. */
export interface AgentRuntime {
  readonly id: string;
  status(force?: boolean): Promise<AgentStatus>;
  start(options: AgentStartOptions): Promise<void>;
  interrupt(runId: string): Promise<void>;
  answer(requestId: string, allow: boolean): void;
  stopAll(): Promise<void>;
}

export interface AgentRuntimeDeps {
  sendEvent(runId: string, event: AgentEvent): void;
  sendPermission(request: AgentPermissionRequest): boolean;
  callTool(
    options: AgentStartOptions,
    name: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<AgentToolResult>;
  log(message: string): void;
  version: string;
  mock: boolean;
}

export class AgentRuntimeRegistry {
  private runtimes = new Map<string, AgentRuntime>();
  private active = new Map<string, { runtime: AgentRuntime; cwd: string }>();
  constructor(runtimes: AgentRuntime[]) {
    for (const runtime of runtimes) {
      if (this.runtimes.has(runtime.id)) throw new Error(`Duplicate agent provider: ${runtime.id}`);
      this.runtimes.set(runtime.id, runtime);
    }
  }
  private runtime(id = 'claude-code'): AgentRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Unsupported agent provider: ${id}`);
    return runtime;
  }
  status(force = false, provider?: string): Promise<AgentStatus> {
    return this.runtime(provider).status(force);
  }
  async start(options: AgentStartOptions): Promise<void> {
    if (!options.runId || this.active.has(options.runId))
      throw new Error('Duplicate or missing agent run.');
    if ([...this.active.values()].some((run) => run.cwd === options.cwd))
      throw new Error(
        'An agent is already working in this Project Folder. Stop it or open a Task.',
      );
    const runtime = this.runtime(options.provider);
    this.active.set(options.runId, { runtime, cwd: options.cwd });
    try {
      await runtime.start(options);
    } finally {
      this.active.delete(options.runId);
    }
  }
  async interrupt(runId: string): Promise<void> {
    await this.active.get(runId)?.runtime.interrupt(runId);
  }
  answer(requestId: string, allow: boolean): void {
    // Adapters own unguessable request IDs and ignore unknown/stale answers.
    for (const runtime of this.runtimes.values()) runtime.answer(requestId, allow);
  }
  async stopAll(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.stopAll()));
  }
}

/** Private IPC, never a public MCP client name. Every request expires with its originating run. */
export class AgentToolBroker {
  private pending = new Map<
    string,
    { resolve(result: AgentToolResult): void; reject(error: Error): void }
  >();
  constructor(private send: (request: AgentToolRequest) => boolean) {}
  call(
    options: AgentStartOptions,
    name: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<AgentToolResult> {
    if (signal.aborted) return Promise.reject(new Error('The agent turn has stopped.'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.pending.delete(requestId);
      };
      const abort = () => {
        cleanup();
        reject(new Error('The agent turn has stopped.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Garden tool timed out.'));
      }, 10 * 60_000);
      this.pending.set(requestId, {
        resolve: (result) => {
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });
      signal.addEventListener('abort', abort, { once: true });
      if (!this.send({ requestId, runId: options.runId, cruxId: options.cruxId, name, input }))
        this.pending.get(requestId)?.reject(new Error('The Garden window is unavailable.'));
    });
  }
  answer(requestId: string, result: AgentToolResult): void {
    this.pending.get(requestId)?.resolve(result);
  }
}

export const GARDEN_TOOL_SPECS = [
  {
    name: 'garden_search_tools',
    description:
      'Discover Crux Garden tools for the active Crux, including embedded creative apps, files, Growth and Cruxspace asset transfer. Search by keyword; results include input schemas. Discover tools before calling them.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword, tool name, or empty string for the first page.',
        },
        offset: { type: 'integer', minimum: 0 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'garden_call_tool',
    description:
      'Execute a previously discovered Crux Garden tool in this Working Copy. Use its exact name and input schema. Respects human edits, ordinary tool guards and approvals. Never assume an external app is connected until its tool succeeds.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        input: { type: 'object', additionalProperties: true },
      },
      required: ['name', 'input'],
      additionalProperties: false,
    },
  },
];
