import { isLoopbackHost } from './loopback';
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
import type { AgentConnection, AgentConnectionStore, NewAgentConnection } from './agent-connections';
import { checkAgentCall, describeScopes, filterDiscoveryText, toolVisible } from './agent-scopes';
import type { AgentScope } from './agent-scopes';

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
 *
 * The whole-garden host is different (ADR 0086): it has no single token. Each
 * named agent connection presents its own token (only its hash is stored, see
 * agent-connections.ts), every session is bound to the connection that opened
 * it, and every tool call is checked against that connection's scopes here,
 * before anything reaches the renderer. Its address (no secret) is written to
 * `<profile>/garden-agent-host/host.json` for the stdio bridge and the CLI.
 * The host runs while at least one connection exists.
 */

export const GARDEN_HOST_ID = '@garden';
const MCP_PATH = '/mcp';
const MCP_CONFIG_DIR = '.crux';
const MCP_CONFIG_FILE = 'mcp.json';
const GARDEN_HOST_FILE = 'host.json';

/** Where the whole-garden host's address is published (no token: each agent brings its own). */
export function gardenHostFile(gardenHostFolder: string): string {
  return path.join(gardenHostFolder, GARDEN_HOST_FILE);
}

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
  /** Profile directory for the separately granted whole-garden host. */
  gardenHostFolder?: string;
  /** Named, scoped agent connections for the whole-garden host (ADR 0086). */
  connections?: AgentConnectionStore;
  /** Look a crux up by id: slug, title and Project Folder (null when unknown or folderless). */
  lookupCrux(cruxId: string): CruxRow | null | Promise<CruxRow | null>;
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
  /** Whole-garden host: the agent connection that opened this session. */
  connectionId?: string;
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
  private lifecycle: Promise<void> = Promise.resolve();
  private closing: Promise<void> | null = null;

  constructor(private deps: AgentHostDeps) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────

  private changeHost<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Crux Garden is shutting down'));
    const result = this.lifecycle.then(operation);
    this.lifecycle = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Per-crux servers. The whole-garden host is described by its connections instead. */
  list(): AgentHostServer[] {
    return [...this.hosts.values()]
      .filter((h) => h.cruxId !== GARDEN_HOST_ID)
      .map((h) => this.describe(h));
  }

  /** Bring the whole-garden host back when connections exist from an earlier run. */
  async resumeGarden(): Promise<void> {
    if (this.deps.gardenHostFolder && this.deps.connections?.list().length)
      await this.changeHost(() => this.ensureGarden());
  }

  /** Switch a crux's server on with a FRESH token (Settings toggle / Regenerate). */
  async enable(cruxId: string): Promise<AgentHostServer> {
    refuseGardenId(cruxId);
    return this.changeHost(() => this.start(cruxId, { freshToken: true }));
  }

  /** Start a crux that was enabled in an earlier run — keeps its token so saved client configs still work. */
  async resume(cruxId: string): Promise<AgentHostServer> {
    refuseGardenId(cruxId);
    return this.changeHost(() => this.start(cruxId, { freshToken: false }));
  }

  async disable(cruxId: string): Promise<void> {
    refuseGardenId(cruxId);
    return this.changeHost(() => this.disableHost(cruxId));
  }

  // ── Whole-garden agent connections (ADR 0086) ─────────────────────────

  private store(): AgentConnectionStore {
    if (!this.deps.connections || !this.deps.gardenHostFolder)
      throw new Error('Agent connections are not available here');
    return this.deps.connections;
  }

  /** The garden host's address, or null while no connection exists. */
  gardenUrl(): string | null {
    return this.hosts.get(GARDEN_HOST_ID)?.url ?? null;
  }

  listConnections(): AgentConnection[] {
    return this.deps.connections?.list() ?? [];
  }

  /** A new connection; its token is in this reply and nowhere else. Starts the garden host. */
  async createConnection(
    input: NewAgentConnection,
  ): Promise<{ connection: AgentConnection; token: string; url: string }> {
    const created = this.store().create(input);
    try {
      const url = await this.changeHost(() => this.ensureGarden());
      this.deps.log(`Agent connection added: ${created.connection.kind}`);
      return { ...created, url };
    } catch (error) {
      this.store().revoke(created.connection.id);
      throw error;
    }
  }

  updateConnection(id: string, patch: { name?: string; scopes?: AgentScope[] }): AgentConnection {
    // Scopes are read on every call, so a change applies to open sessions at once.
    return this.store().update(id, patch);
  }

  /** A fresh token for the same connection; sessions on the old one end now. */
  async rotateConnection(id: string): Promise<{ connection: AgentConnection; token: string; url: string }> {
    const rotated = this.store().rotate(id);
    await this.closeConnectionSessions(id);
    const url = await this.changeHost(() => this.ensureGarden());
    return { ...rotated, url };
  }

  /** Remove a connection: its token stops working and its open sessions end. */
  async revokeConnection(id: string): Promise<void> {
    if (!this.store().revoke(id)) return;
    await this.closeConnectionSessions(id);
    this.deps.log('Agent connection removed');
    if (this.store().list().length === 0)
      await this.changeHost(() => this.disableHost(GARDEN_HOST_ID));
  }

  private async closeConnectionSessions(id: string): Promise<void> {
    const host = this.hosts.get(GARDEN_HOST_ID);
    if (!host) return;
    for (const [sid, session] of [...host.sessions]) {
      if (session.connectionId !== id) continue;
      host.sessions.delete(sid);
      try {
        await session.transport.close();
      } catch {}
    }
    this.deps.onChanged(this.list());
  }

  private async ensureGarden(): Promise<string> {
    const running = this.hosts.get(GARDEN_HOST_ID);
    if (running) return running.url;
    return (await this.start(GARDEN_HOST_ID, { freshToken: false })).url;
  }

  private async disableHost(cruxId: string): Promise<void> {
    const host = this.hosts.get(cruxId);
    if (!host) return;
    this.hosts.delete(cruxId);
    await this.closeHost(host);
    if (cruxId === GARDEN_HOST_ID) fs.rmSync(gardenHostFile(host.folder), { force: true });
    else removeConfig(host.folder);
    this.deps.log(`Agent host off for ${host.slug}`);
    this.deps.onChanged(this.list());
  }

  stopAll(): Promise<void> {
    // Stop admission now, then drain accepted starts/disables before closing.
    // A delayed API lookup must never resurrect a host after shutdown.
    this.closing ??= this.lifecycle.then(async () => {
      const all = [...this.hosts.values()];
      this.hosts.clear();
      await Promise.all(all.map((h) => this.closeHost(h)));
      for (const [id, p] of this.pending) {
        this.pending.delete(id);
        if (p.timer) clearTimeout(p.timer);
        p.reject(new Error('Crux Garden is shutting down'));
      }
    });
    return this.closing;
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
    const garden = cruxId === GARDEN_HOST_ID;
    const row =
      garden && this.deps.gardenHostFolder
        ? {
            id: GARDEN_HOST_ID,
            slug: 'garden',
            title: 'Whole garden',
            folder: this.deps.gardenHostFolder,
          }
        : await this.deps.lookupCrux(cruxId);
    if (!row) throw new Error('This crux has no Project Folder to host');
    const folder = garden ? row.folder : this.deps.resolveKnownFolder(row.folder);

    const existing = this.hosts.get(cruxId);
    const previous = existing ? null : garden ? readGardenHost(folder) : readConfig(folder);
    if (existing) {
      this.hosts.delete(cruxId);
      await this.closeHost(existing);
    }

    // The garden host has no token of its own: each agent connection brings one.
    const token = garden
      ? ''
      : opts.freshToken
        ? generateToken()
        : existing?.token || (previous as McpConfigFile | null)?.token || generateToken();
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
    if (garden) {
      writeGardenHost(folder, host.url);
      removeConfig(folder); // a single garden token from before ADR 0086 means nothing now
    } else
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
    await new Promise<void>((resolve) => {
      host.http.close(() => resolve());
      host.http.closeAllConnections();
    });
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
      let connection: AgentConnection | null = null;
      if (host.cruxId === GARDEN_HOST_ID) {
        connection = this.deps.connections?.verify(presented) ?? null;
        if (!connection) {
          res.setHeader('WWW-Authenticate', 'Bearer realm="crux-garden"');
          return reply(res, 401, {
            error:
              'this agent connection is not valid — it may have been removed. Make a new one in Crux Garden → Settings → Agents.',
          });
        }
      } else if (!presented || !tokensEqual(presented, host.token)) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="crux-garden"');
        return reply(res, 401, { error: 'a valid Bearer token from .crux/mcp.json is required' });
      }

      const sessionId = headerValue(req.headers['mcp-session-id']);
      const body = req.method === 'POST' ? await readJson(req) : undefined;

      if (sessionId) {
        const session = host.sessions.get(sessionId);
        if (!session) return reply(res, 404, { error: 'unknown session — initialize again' });
        // A session belongs to the connection that opened it; another token cannot ride it.
        if (connection && session.connectionId !== connection.id)
          return reply(res, 403, { error: 'this session belongs to another agent connection' });
        if (connection)
          this.deps.connections?.touch(connection.id, session.server.getClientVersion()?.name);
        await session.transport.handleRequest(req, res, body);
        return;
      }
      if (req.method !== 'POST' || !isInitialize(body)) {
        return reply(res, 400, { error: 'no session: send an initialize request first' });
      }

      if (connection) this.deps.connections?.touch(connection.id, clientNameOf(body));
      const session = this.createSession(host, connection);
      await session.server.connect(session.transport);
      await session.transport.handleRequest(req, res, body);
    } catch (err: any) {
      this.deps.log(`Agent host request failed: ${err?.message}`);
      if (!res.headersSent) reply(res, 500, { error: 'internal error' });
    }
  }

  private createSession(host: RunningHost, connection: AgentConnection | null = null): Session {
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
          host.cruxId === GARDEN_HOST_ID
            ? 'You have a whole-garden connection to Crux Garden. Use list_garden_tools to discover operating actions. Use list_crux_tools and call_crux_tool for creative work in a named Crux. Actions remain visible; existing human approvals apply. Never approve your own requests. ' +
              describeScopes(connection?.scopes ?? [])
            : `You are working in the Crux Garden crux "${host.name}". Its Project Folder is ${host.folder}. ` +
              'Read crux://agents-md first. Files you write appear in the app and in its Growth history; ' +
              'deletes and publishing wait for the person to approve them in the app.',
      },
    );
    const session: Session = { server, transport, connectionId: connection?.id };
    // Garden actions are attributed to the connection the person named.
    const current = () =>
      session.connectionId ? (this.deps.connections?.get(session.connectionId) ?? null) : null;
    const agentName = () =>
      current()?.name || server.getClientVersion()?.name || connection?.name || 'agent';

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      let defs = (await this.ask({
        kind: 'tools/list',
        cruxId: host.cruxId,
        agent: agentName(),
      })) as AgentToolDefinition[];
      if (session.connectionId) {
        const scopes = current()?.scopes ?? [];
        defs = defs.filter((d) => toolVisible(scopes, d.name));
      }
      return {
        tools: defs.map((d) => ({
          name: d.name,
          description: d.description,
          inputSchema: d.input_schema,
        })),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const name = request.params.name;
      const input = (request.params.arguments as Record<string, unknown>) || {};
      let scopes: AgentScope[] | null = null;
      if (session.connectionId) {
        // Enforcement point (ADR 0086): every garden call, checked against the
        // connection's CURRENT scopes before the renderer sees it.
        const live = current();
        if (!live)
          return {
            content: [{ type: 'text', text: 'Error: This agent connection was removed.' }],
            isError: true,
          };
        const check = checkAgentCall(live.scopes, live.name, name, input);
        if (!check.allowed) {
          this.deps.log(`Agent connection call refused: ${name}`);
          return { content: [{ type: 'text', text: check.message }], isError: true };
        }
        scopes = live.scopes;
      }
      const result = (await this.ask(
        { kind: 'tools/call', cruxId: host.cruxId, agent: agentName(), name, input },
        { signal: extra.signal, timeoutMs: null },
      )) as any;
      return scopes ? filterDiscoveryResult(scopes, name, input, result) : result;
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: host.cruxId === GARDEN_HOST_ID ? [] : CRUX_RESOURCES,
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
        reject(new Error('Crux Garden is not ready — enter the garden and try again'));
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

function refuseGardenId(cruxId: string): void {
  if (cruxId === GARDEN_HOST_ID)
    throw new Error('Whole-garden access is given per agent connection. Add one in Settings → Agents.');
}

/** Discovery answers list only what the connection may call. */
function filterDiscoveryResult(
  scopes: AgentScope[],
  name: string,
  input: Record<string, unknown>,
  result: any,
): any {
  const inner = name === 'call_garden_tool' && typeof input.name === 'string' ? input.name : name;
  const level = inner === 'list_garden_tools' ? 'garden' : inner === 'list_crux_tools' ? 'crux' : null;
  if (!level || result?.isError || !Array.isArray(result?.content)) return result;
  return {
    ...result,
    content: result.content.map((block: any) =>
      block?.type === 'text' && typeof block.text === 'string'
        ? { ...block, text: filterDiscoveryText(scopes, block.text, level) }
        : block,
    ),
  };
}

function clientNameOf(body: unknown): string | null {
  const msgs = Array.isArray(body) ? body : [body];
  for (const m of msgs) {
    const name = (m as any)?.params?.clientInfo?.name;
    if (typeof name === 'string' && name) return name;
  }
  return null;
}

function readGardenHost(folder: string): { url: string } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(gardenHostFile(folder), 'utf8'));
    return typeof parsed?.url === 'string' ? { url: parsed.url } : null;
  } catch {
    return null;
  }
}

function writeGardenHost(folder: string, url: string): void {
  fs.mkdirSync(folder, { recursive: true });
  const file = gardenHostFile(folder);
  fs.writeFileSync(file, JSON.stringify({ url, transport: 'http' }, null, 2) + '\n', {
    mode: 0o600,
  });
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}

function removeConfig(folder: string): void {
  try {
    fs.unlinkSync(mcpConfigPath(folder));
    fs.rmdirSync(path.join(folder, MCP_CONFIG_DIR));
  } catch {
    /* already gone, or the dir holds something else */
  }
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
