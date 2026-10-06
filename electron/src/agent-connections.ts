import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { normalizeScopes, type AgentScope } from './agent-scopes';

/**
 * Named agent connections for the whole-garden Agent Host (ADR 0086).
 *
 * Each outside agent gets its own token, its own scopes and its own "last
 * used". Only a SHA-256 of the token is kept: tokens are 256 random bits, so a
 * fast hash is enough (no password stretching needed), and nothing on disk can
 * be replayed. The token itself exists once — in the reply to `create` or
 * `rotate`, which the app shows a single time — and in the agent's own config.
 * The file lives in the desktop profile (mode 600), outside every Project
 * Folder, export and Growth. Tokens are never logged.
 */

export const AGENT_KINDS = [
  'claude-code',
  'codex',
  'cursor',
  'claude-desktop',
  'cli',
  'other',
] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export interface AgentConnection {
  id: string;
  name: string;
  kind: AgentKind;
  scopes: AgentScope[];
  created: string;
  /** Last authenticated request, or null until the agent first connects. */
  lastUsed: string | null;
  /** The MCP client's own name from its last session, when it gave one. */
  lastClient: string | null;
  /** The token's last four characters, so a person can tell two apart. */
  tokenHint: string;
}

interface StoredConnection extends AgentConnection {
  tokenHash: string;
}

export interface NewAgentConnection {
  name: string;
  kind: AgentKind;
  scopes: AgentScope[];
}

const FILE = 'connections.json';
const MAX_CONNECTIONS = 50;
const TOKEN_PREFIX = 'cg_';
/** How often an in-use connection's "last used" reaches the disk. */
const TOUCH_PERSIST_MS = 30_000;

export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateAgentToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function cleanConnectionName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('Give the connection a name.');
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('Give the connection a name.');
  if (clean.length > 60) throw new Error('Keep the name under 60 characters.');
  if ([...clean].some((c) => c.charCodeAt(0) < 32))
    throw new Error('That name has hidden characters.');
  return clean;
}

function isKind(value: unknown): value is AgentKind {
  return typeof value === 'string' && (AGENT_KINDS as readonly string[]).includes(value);
}

function publicView(stored: StoredConnection): AgentConnection {
  const { tokenHash: _hash, ...rest } = stored;
  return { ...rest, scopes: [...rest.scopes] };
}

export class AgentConnectionStore {
  private readonly file: string;
  private connections: StoredConnection[] | null = null;
  private persistedTouch = new Map<string, number>();

  constructor(
    private readonly folder: string,
    private readonly options: {
      now?: () => Date;
      onChanged?: (connections: AgentConnection[]) => void;
      log?: (message: string) => void;
    } = {},
  ) {
    this.file = path.join(folder, FILE);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private load(): StoredConnection[] {
    if (this.connections) return this.connections;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Unreadable means no connection authenticates; keep the file aside for repair.
        this.options.log?.(
          'Agent connections file is unreadable; set aside, no connection is valid',
        );
        try {
          fs.renameSync(this.file, `${this.file}.unreadable-${Date.now()}`);
        } catch {}
      }
      this.connections = [];
      return this.connections;
    }
    const list = (parsed as { connections?: unknown })?.connections;
    this.connections = (Array.isArray(list) ? list : [])
      .filter(
        (c): c is StoredConnection =>
          !!c &&
          typeof c.id === 'string' &&
          typeof c.name === 'string' &&
          typeof c.tokenHash === 'string' &&
          /^[0-9a-f]{64}$/.test(c.tokenHash) &&
          isKind(c.kind),
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        scopes: normalizeScopes(c.scopes),
        created: typeof c.created === 'string' ? c.created : this.now().toISOString(),
        lastUsed: typeof c.lastUsed === 'string' ? c.lastUsed : null,
        lastClient: typeof c.lastClient === 'string' ? c.lastClient : null,
        tokenHint: typeof c.tokenHint === 'string' ? c.tokenHint : '',
        tokenHash: c.tokenHash,
      }));
    return this.connections;
  }

  private persist(): void {
    const connections = this.load();
    fs.mkdirSync(this.folder, { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, connections }, null, 2) + '\n', {
        mode: 0o600,
      });
      fs.renameSync(temporary, this.file);
      try {
        fs.chmodSync(this.file, 0o600);
      } catch {}
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  private changed(): void {
    this.options.onChanged?.(this.list());
  }

  list(): AgentConnection[] {
    return this.load().map(publicView);
  }

  get(id: string): AgentConnection | null {
    const found = this.load().find((c) => c.id === id);
    return found ? publicView(found) : null;
  }

  create(input: NewAgentConnection): { connection: AgentConnection; token: string } {
    const name = cleanConnectionName(input.name);
    if (!isKind(input.kind)) throw new Error('Choose which agent this is for.');
    const connections = this.load();
    if (connections.length >= MAX_CONNECTIONS)
      throw new Error('That is a lot of connections. Remove one you no longer use first.');
    const token = generateAgentToken();
    const stored: StoredConnection = {
      id: randomUUID(),
      name,
      kind: input.kind,
      scopes: normalizeScopes(input.scopes),
      created: this.now().toISOString(),
      lastUsed: null,
      lastClient: null,
      tokenHint: token.slice(-4),
      tokenHash: hashAgentToken(token),
    };
    connections.push(stored);
    this.persist();
    this.changed();
    return { connection: publicView(stored), token };
  }

  update(id: string, patch: { name?: string; scopes?: AgentScope[] }): AgentConnection {
    const stored = this.load().find((c) => c.id === id);
    if (!stored) throw new Error('That connection no longer exists.');
    if (patch.name !== undefined) stored.name = cleanConnectionName(patch.name);
    if (patch.scopes !== undefined) stored.scopes = normalizeScopes(patch.scopes);
    this.persist();
    this.changed();
    return publicView(stored);
  }

  /** A new token for the same connection; the old one stops working at once. */
  rotate(id: string): { connection: AgentConnection; token: string } {
    const stored = this.load().find((c) => c.id === id);
    if (!stored) throw new Error('That connection no longer exists.');
    const token = generateAgentToken();
    stored.tokenHash = hashAgentToken(token);
    stored.tokenHint = token.slice(-4);
    stored.lastUsed = null;
    stored.lastClient = null;
    this.persist();
    this.changed();
    return { connection: publicView(stored), token };
  }

  revoke(id: string): boolean {
    const connections = this.load();
    const index = connections.findIndex((c) => c.id === id);
    if (index < 0) return false;
    connections.splice(index, 1);
    this.persistedTouch.delete(id);
    this.persist();
    this.changed();
    return true;
  }

  /** The connection a presented token belongs to, or null. Compares hashes in constant time. */
  verify(token: string | null | undefined): AgentConnection | null {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX) || token.length > 200)
      return null;
    const presented = Buffer.from(hashAgentToken(token), 'hex');
    let match: StoredConnection | null = null;
    for (const c of this.load()) {
      const candidate = Buffer.from(c.tokenHash, 'hex');
      if (candidate.length === presented.length && timingSafeEqual(candidate, presented)) match = c;
    }
    return match ? publicView(match) : null;
  }

  /** Record use. The first use, a new client name, or 30 s since the last write reach the disk. */
  touch(id: string, client?: string | null): void {
    const stored = this.load().find((c) => c.id === id);
    if (!stored) return;
    const now = this.now();
    const first = stored.lastUsed === null;
    const clientName = client ? client.slice(0, 80) : null;
    const newClient = !!clientName && clientName !== stored.lastClient;
    stored.lastUsed = now.toISOString();
    if (clientName) stored.lastClient = clientName;
    const last = this.persistedTouch.get(id) ?? 0;
    if (first || newClient || now.getTime() - last >= TOUCH_PERSIST_MS) {
      this.persistedTouch.set(id, now.getTime());
      try {
        this.persist();
      } catch {
        /* last-used is advisory; a full disk must not fail the request */
      }
      this.changed();
    }
  }
}
