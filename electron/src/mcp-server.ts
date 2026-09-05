const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  AgentHostRequest,
  AgentHostResponse,
  AgentHostServer,
  AgentToolDefinition,
} from './bridge';

/**
 * Agent Host (ADR 0013): one MCP server per crux the user has switched on.
 *
 * Hosted here in the Electron main process; streamable HTTP on a loopback
 * port from the same family the preview servers use (ADR 0003 — an ephemeral
 * 127.0.0.1 port per crux, re-bound to the previous port when it is free so
 * a client's saved URL keeps working across restarts). Nothing executes
 * here: every `tools/call` and `resources/read` is forwarded over IPC to the
 * renderer's `services/agent-host.ts`, which runs the SAME tool executor the
 * built-in collaborator uses — one implementation of `write_file`, one
 * delete-approval banner, one Collaboration record. The crux must be open in
 * the app for a call to run; otherwise the agent gets a clear error.
 *
 * Auth: a per-crux random token, written to `<ProjectFolder>/.crux/mcp.json`
 * (mode 600) so a client can be pointed at the server with one command. The
 * token is required as a Bearer header on every request; the socket is bound
 * to 127.0.0.1 and any request whose peer or Host header is not loopback is
 * refused before it reaches the protocol layer. `.crux/` is in the watcher's
 * default ignores, so the file is never ingested, versioned, or published.
 */

export const MCP_PATH = '/mcp';
export const MCP_CONFIG_DIR = '.crux';
export const MCP_CONFIG_FILE = 'mcp.json';

/** What `.crux/mcp.json` holds — the one file an agent needs to connect. */
export interface McpConfigFile {
  url: string;
  token: string;
  cruxId: string;
  name: string;
  slug: string;
  transport: 'http';
}

export function mcpConfigPath(folder: string): string {
  return path.join(folder, MCP_CONFIG_DIR, MCP_CONFIG_FILE);
}

/** Loopback-only Host header check (`127.0.0.1[:port]`, `localhost[:port]`, `[::1][:port]`). */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  const bare = h.startsWith('[')
    ? h.replace(/^\[([^\]]+)\](:\d+)?$/, '$1')
    : h.replace(/:\d+$/, '');
  return bare === '127.0.0.1' || bare === 'localhost' || bare === '::1';
}

/** Loopback peer check for the raw socket. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** The token from an `Authorization: Bearer …` header, or null. */
export function bearerOf(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(value);
  return m ? m[1]! : null;
}

export function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** The resources every crux server offers; their content comes from the renderer. */
export const CRUX_RESOURCES = [
  {
    uri: 'crux://files',
    name: 'Files',
    description: 'Every working file in this crux (paths).',
    mimeType: 'application/json',
  },
  {
    uri: 'crux://growth',
    name: 'Growth',
    description: 'The Growth timeline — snapshots with labels, dates and who asked for them.',
    mimeType: 'application/json',
  },
  {
    uri: 'crux://preview',
    name: 'Preview',
    description: 'The local preview URL for this crux.',
    mimeType: 'application/json',
  },
  {
    uri: 'crux://persona',
    name: 'Persona',
    description: "The collaborator persona's name, greeting and instructions.",
    mimeType: 'application/json',
  },
  {
    uri: 'crux://agents-md',
    name: 'AGENTS.md',
    description: 'How to work in this crux — content model, conventions, what not to touch.',
    mimeType: 'text/markdown',
  },
];

interface CruxRow {
  slug: string;
  title: string;
  folder: string;
}

export interface AgentHostDeps {
  /** Look a crux up by id: slug, title and Project Folder (null when unknown or folderless). */
  lookupCrux(cruxId: string): CruxRow | null;
  /** Validate a folder sits under a known garden root; returns the resolved path. */
  resolveKnownFolder(folder: string): string;
  /** Forward a request to the renderer; false when there is no window to ask. */
  sendToRenderer(request: AgentHostRequest): boolean;
  /** Tell Settings the running set changed. */
  onChanged(servers: AgentHostServer[]): void;
  /** Absolute path of the stdio launcher script (dist/mcp-stdio.js). */
  stdioScript: string;
  version: string;
  log(message: string): void;
}

interface Session {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

interface RunningHost {
  cruxId: string;
  slug: string;
  name: string;
  folder: string;
  token: string;
  url: string;
  http: any;
  sessions: Map<string, Session>;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** `Omit` over a discriminated union, member by member. */
type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never;

const LIST_TIMEOUT_MS = 30_000;

export class AgentHost {
  private hosts = new Map<string, RunningHost>(); // cruxId -> host
  private pending = new Map<string, Pending>();

  constructor(private deps: AgentHostDeps) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────

  list(): AgentHostServer[] {
    return [...this.hosts.values()].map((h) => this.describe(h));
  }

  /** Switch a crux's server on with a FRESH token (Settings toggle / Regenerate). */
  async enable(cruxId: string): Promise<AgentHostServer> {
    return this.start(cruxId, { freshToken: true });
  }

  /** Start a crux that was enabled in an earlier run — keeps its token so saved client configs still work. */
  async resume(cruxId: string): Promise<AgentHostServer> {
    return this.start(cruxId, { freshToken: false });
  }

  async disable(cruxId: string): Promise<void> {
    const host = this.hosts.get(cruxId);
    if (!host) return;
    this.hosts.delete(cruxId);
    await this.closeHost(host);
    try {
      fs.unlinkSync(mcpConfigPath(host.folder));
      fs.rmdirSync(path.join(host.folder, MCP_CONFIG_DIR));
    } catch {
      /* already gone, or the dir holds something else */
    }
    this.deps.log(`Agent host off for ${host.slug}`);
    this.deps.onChanged(this.list());
  }

  async stopAll(): Promise<void> {
    const all = [...this.hosts.values()];
    this.hosts.clear();
    await Promise.all(all.map((h) => this.closeHost(h)));
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.reject(new Error('Crux Garden is shutting down'));
    }
  }

  /** The renderer answered a forwarded request. */
  handleResponse(response: AgentHostResponse): void {
    const p = this.pending.get(response.id);
    if (!p) return;
    this.pending.delete(response.id);
    if (p.timer) clearTimeout(p.timer);
    if (response.error) p.reject(new Error(response.error));
    else p.resolve(response.result);
  }

  private async start(cruxId: string, opts: { freshToken: boolean }): Promise<AgentHostServer> {
    const row = this.deps.lookupCrux(cruxId);
    if (!row) throw new Error('This crux has no Project Folder to host');
    const folder = this.deps.resolveKnownFolder(row.folder);

    const existing = this.hosts.get(cruxId);
    const previous = existing ? null : readConfig(folder);
    if (existing) {
      this.hosts.delete(cruxId);
      await this.closeHost(existing);
    }

    const token = opts.freshToken
      ? generateToken()
      : existing?.token || previous?.token || generateToken();
    const preferredPort = portOf(existing?.url || previous?.url || '');
    const host: RunningHost = {
      cruxId,
      slug: row.slug,
      name: row.title || row.slug,
      folder,
      token,
      url: '',
      http: null,
      sessions: new Map(),
    };
    host.http = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      void this.handleHttp(host, req, res);
    });
    const port = await listenLoopback(host.http, preferredPort);
    host.url = `http://127.0.0.1:${port}${MCP_PATH}`;
    this.hosts.set(cruxId, host);
    writeConfig(folder, {
      url: host.url,
      token,
      cruxId,
      name: host.name,
      slug: host.slug,
      transport: 'http',
    });
    this.deps.log(`Agent host on for ${host.slug} at ${host.url}`);
    this.deps.onChanged(this.list());
    return this.describe(host);
  }

  private async closeHost(host: RunningHost): Promise<void> {
    for (const s of host.sessions.values()) {
      try {
        await s.transport.close();
      } catch {}
    }
    host.sessions.clear();
    await new Promise<void>((resolve) => host.http.close(() => resolve()));
  }

  private describe(host: RunningHost): AgentHostServer {
    return {
      cruxId: host.cruxId,
      slug: host.slug,
      name: host.name,
      folder: host.folder,
      url: host.url,
      token: host.token,
      configPath: mcpConfigPath(host.folder),
      stdioCommand: `node ${quote(this.deps.stdioScript)} --config ${quote(mcpConfigPath(host.folder))}`,
      clients: [...host.sessions.values()]
        .map((s) => s.server.getClientVersion()?.name ?? '')
        .filter(Boolean),
    };
  }

  // ── HTTP ──────────────────────────────────────────────────────────────

  private async handleHttp(host: RunningHost, req: IncomingMessage, res: ServerResponse) {
    try {
      // Loopback only — the socket is bound to 127.0.0.1, and a browser page
      // or a forwarded port must not be able to reach it by another name.
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        return reply(res, 403, { error: 'loopback only' });
      }
      if (!isLoopbackHost(req.headers.host)) {
        return reply(res, 421, { error: 'misdirected: this server answers only to 127.0.0.1' });
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname !== MCP_PATH && url.pathname !== '/') {
        return reply(res, 404, { error: 'not found' });
      }
      const presented = bearerOf(req.headers.authorization);
      if (!presented || !tokensEqual(presented, host.token)) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="crux-garden"');
        return reply(res, 401, { error: 'a valid Bearer token from .crux/mcp.json is required' });
      }

      const sessionId = headerValue(req.headers['mcp-session-id']);
      const body = req.method === 'POST' ? await readJson(req) : undefined;

      if (sessionId) {
        const session = host.sessions.get(sessionId);
        if (!session) return reply(res, 404, { error: 'unknown session — initialize again' });
        await session.transport.handleRequest(req, res, body);
        return;
      }
      if (req.method !== 'POST' || !isInitialize(body)) {
        return reply(res, 400, { error: 'no session: send an initialize request first' });
      }

      const session = this.createSession(host);
      await session.server.connect(session.transport);
      await session.transport.handleRequest(req, res, body);
    } catch (err: any) {
      this.deps.log(`Agent host request failed: ${err?.message}`);
      if (!res.headersSent) reply(res, 500, { error: 'internal error' });
    }
  }

  private createSession(host: RunningHost): Session {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid: string) => {
        host.sessions.set(sid, session);
        this.deps.onChanged(this.list());
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && host.sessions.get(sid) === session) {
        host.sessions.delete(sid);
        this.deps.onChanged(this.list());
      }
    };
    const server = new Server(
      { name: `crux-garden:${host.slug}`, version: this.deps.version },
      {
        capabilities: { tools: { listChanged: true }, resources: {} },
        instructions:
          `You are working in the Crux Garden crux "${host.name}". Its Project Folder is ${host.folder}. ` +
          'Read crux://agents-md first. Files you write appear in the app and in its Growth history; ' +
          'deletes and publishing wait for the person to approve them in the app.',
      },
    );
    const session: Session = { server, transport };
    const agentName = () => server.getClientVersion()?.name || 'agent';

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const defs = (await this.ask({
        kind: 'tools/list',
        cruxId: host.cruxId,
        agent: agentName(),
      })) as AgentToolDefinition[];
      return {
        tools: defs.map((d) => ({
          name: d.name,
          description: d.description,
          inputSchema: d.input_schema,
        })),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const result = await this.ask(
        {
          kind: 'tools/call',
          cruxId: host.cruxId,
          agent: agentName(),
          name: request.params.name,
          input: (request.params.arguments as Record<string, unknown>) || {},
        },
        { signal: extra.signal, timeoutMs: null },
      );
      return result as any;
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: CRUX_RESOURCES,
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const result = await this.ask({
        kind: 'resources/read',
        cruxId: host.cruxId,
        agent: agentName(),
        uri: request.params.uri,
      });
      return result as any;
    });

    return session;
  }

  // ── Forwarding to the renderer ────────────────────────────────────────

  private ask(
    request: WithoutId<AgentHostRequest>,
    opts: { signal?: AbortSignal; timeoutMs: number | null } = { timeoutMs: LIST_TIMEOUT_MS },
  ): Promise<unknown> {
    const id = crypto.randomUUID();
    const full = { ...request, id } as AgentHostRequest;
    return new Promise((resolve, reject) => {
      const pending: Pending = { resolve, reject, timer: null };
      if (opts.timeoutMs) {
        pending.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('Crux Garden did not answer in time'));
        }, opts.timeoutMs);
      }
      opts.signal?.addEventListener('abort', () => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        reject(new Error('cancelled by the client'));
      });
      this.pending.set(id, pending);
      if (!this.deps.sendToRenderer(full)) {
        this.pending.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        reject(new Error('Crux Garden has no open window — open the app and try again'));
      }
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 32 * 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function isInitialize(body: unknown): boolean {
  const msgs = Array.isArray(body) ? body : [body];
  return msgs.some((m) => m && typeof m === 'object' && (m as any).method === 'initialize');
}

function portOf(url: string): number {
  try {
    return Number(new URL(url).port) || 0;
  } catch {
    return 0;
  }
}

/** Bind to 127.0.0.1 on `preferred` when it is free, else an ephemeral port (ADR 0003 family). */
function listenLoopback(server: any, preferred: number): Promise<number> {
  const attempt = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const onError = (err: any) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(server.address().port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
  if (!preferred) return attempt(0);
  return attempt(preferred).catch(() => attempt(0));
}

function readConfig(folder: string): McpConfigFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(mcpConfigPath(folder), 'utf8'));
    return typeof parsed?.token === 'string' ? (parsed as McpConfigFile) : null;
  } catch {
    return null;
  }
}

function writeConfig(folder: string, config: McpConfigFile): void {
  const file = mcpConfigPath(folder);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // mode applies on create only; chmod covers an existing file too. The
  // token must not be readable by other accounts on the machine.
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}

function quote(s: string): string {
  return /[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}
