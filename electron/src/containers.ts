/**
 * Containers: running a Crux's own stack with Docker Compose.
 *
 * A Stack Crux carries a `compose.yaml` in its Project Folder; the app starts
 * and stops it, and shows what is running. Growth versions the stack because
 * it is text, and export carries it to another machine.
 *
 * The seam is narrow on purpose:
 *
 *   · only `docker compose` (or `podman compose`), never bare `docker run`;
 *   · only the verbs below — no `exec`, no `cp`, no `build --output`;
 *   · the working directory is pinned to the Crux folder, and the project
 *     name is fixed to `crux-<cruxId>`, so `down` can only reach containers
 *     this Crux started;
 *   · the compose file is read and checked before every start.
 *
 * **The risk is the file, not the arguments.** A compose file can mount the
 * whole disk, take the host's network, or hand over the Docker socket — which
 * is root. `inspectCompose` refuses all of that before anything runs, and it
 * lives here, in the shell, where a page cannot reach it.
 */
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** The compose verbs a Crux may use. */
export const COMPOSE_VERBS = [
  'up',
  'down',
  'ps',
  'logs',
  'pull',
  'config',
  'stop',
  'start',
  // A command in a service: `run` starts a fresh container and removes it,
  // `exec` uses the one already running. Both take an argument list, never a
  // command line, and neither reaches a shell — the danger a stack poses is
  // what its file asks for, and that is checked before anything starts.
  'run',
  'exec',
] as const;
export type ComposeVerb = (typeof COMPOSE_VERBS)[number];

export interface ComposeRunner {
  /** The program that answered: `docker` or `podman`. */
  program: string;
  version: string;
}

/**
 * One service, as the file describes it. Everything here is read from
 * `compose.yaml` so a bench can be built from any stack someone brings — the
 * page has no list of its own.
 */
export interface ComposeService {
  name: string;
  image?: string;
  /** The comment written above the service in the file, if any. */
  about?: string;
  /** Host ports the service asks for, with what they reach inside. */
  ports: { host: number; container?: number }[];
  /** Services it waits for. */
  dependsOn: string[];
  /** Whether the file gives it a healthcheck, so the bench can wait for it. */
  healthcheck: boolean;
  /** Its restart policy, as written — `no` marks a service meant to exit. */
  restart?: string;
  /** The names of its environment keys. Never the values. */
  envKeys: string[];
  /** Named volumes and paths it mounts, as written. */
  volumes: string[];
  /** Compose profiles it belongs to; empty means it always runs. */
  profiles: string[];
}

/**
 * A setting the stack reads, as `${NAME}` or `${NAME:-default}` in the file.
 * A default makes the stack work out of the box; a value in `.env` or the
 * Crux's secrets overrides it for this machine.
 */
export interface ComposeVariable {
  name: string;
  /** What the file falls back to, when it names one. */
  fallback?: string;
  /** Set in the Crux's `.env`. The value is not reported — only that it is set. */
  fromEnv: boolean;
}

export interface ComposeReading {
  services: ComposeService[];
  /** Why this file must not be started, if so. Empty means it may run. */
  refusals: string[];
  /** The files Compose will actually read, in the order it merges them. */
  files: string[];
  /** Every profile the stack names, so optional services can be offered. */
  profiles: string[];
  /** The settings it reads, with the defaults that make it work unchanged. */
  variables: ComposeVariable[];
}

let runnerCache: ComposeRunner | null | undefined;

function ask(program: string, args: string[], timeout = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(program, args, { timeout }, (error, stdout) => {
      resolve(error ? null : String(stdout || '').trim());
    });
  });
}

/**
 * Whether this machine can run a stack, and with what. Docker Desktop is not
 * free for larger companies and Podman speaks the same commands, so either is
 * accepted and the answer says which one replied.
 */
export async function composeRunner(refresh = false): Promise<ComposeRunner | null> {
  if (runnerCache !== undefined && !refresh) return runnerCache;
  for (const program of ['docker', 'podman']) {
    const version = await ask(program, ['compose', 'version']);
    if (version) {
      runnerCache = { program, version: version.split('\n')[0] ?? version };
      return runnerCache;
    }
  }
  runnerCache = null;
  return null;
}

export function clearComposeRunnerCache(): void {
  runnerCache = undefined;
}

/**
 * Read a compose file well enough to build an interface from it: the services,
 * what each one is (the comment above it counts as its description), the ports
 * it publishes, what it waits for, and whether it is meant to stay up.
 *
 * This is a reader, not a YAML implementation. It handles the shapes compose
 * files actually use and ignores what it does not recognise, because its
 * answers drive a page, and `docker compose config` remains the authority.
 */
function scanYaml(text: string): { services: ComposeService[]; lines: string[] } {
  const lines = text.split('\n');
  const services: ComposeService[] = [];
  let inServices = false;
  let current: ComposeService | null = null;
  let block: 'ports' | 'environment' | 'volumes' | 'depends_on' | 'profiles' | null = null;
  let comment: string[] = [];

  const blank = (name: string, about: string[]): ComposeService => ({
    name,
    about: about.length ? about.join(' ') : undefined,
    ports: [],
    dependsOn: [],
    healthcheck: false,
    envKeys: [],
    volumes: [],
    profiles: [],
  });

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim()) {
      comment = [];
      continue;
    }
    if (/^\s*#/.test(line)) {
      comment.push(line.replace(/^\s*#\s?/, '').trim());
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inServices = /^services\s*:/.test(line);
      if (current) services.push(current);
      current = null;
      block = null;
      comment = [];
      continue;
    }
    if (!inServices) {
      comment = [];
      continue;
    }
    if (indent === 2 && /^\s*[\w.-]+\s*:\s*$/.test(line)) {
      if (current) services.push(current);
      current = blank(line.trim().replace(/:$/, ''), comment);
      block = null;
      comment = [];
      continue;
    }
    comment = [];
    if (!current) continue;

    if (indent <= 4) {
      block = null;
      const key = /^\s*([\w.-]+)\s*:/.exec(line)?.[1];
      if (
        key === 'ports' ||
        key === 'environment' ||
        key === 'volumes' ||
        key === 'depends_on' ||
        key === 'profiles'
      )
        block = key;
      // A list can be written inline — `profiles: [api]` — as well as over
      // several lines, and a compose file may use either.
      const inline = /^\s*[\w.-]+\s*:\s*\[(.*)\]\s*$/.exec(line)?.[1];
      if (block && inline !== undefined) {
        const items = inline
          .split(',')
          .map((part) => part.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        if (block === 'profiles') current.profiles.push(...items);
        if (block === 'volumes') current.volumes.push(...items);
        if (block === 'depends_on') current.dependsOn.push(...items);
        block = null;
        continue;
      }
      if (key === 'image') current.image = line.split(':').slice(1).join(':').trim();
      if (key === 'restart')
        current.restart = line
          .split(':')
          .slice(1)
          .join(':')
          .trim()
          .replace(/^["']|["']$/g, '');
      if (key === 'healthcheck') current.healthcheck = true;
      if (block) continue;
    }

    const item = /^\s*-\s*(.*)$/.exec(line)?.[1]?.replace(/^["']|["']$/g, '');
    if (block === 'ports' && item) {
      // "5432:5432", "${POSTGRES_PORT:-5432}:5432", "127.0.0.1:8080:80", "3000"
      const parts = item.split(':');
      const container = Number(/(\d+)/.exec(parts[parts.length - 1] ?? '')?.[1] ?? 0) || undefined;
      const hostText = parts.length > 1 ? (parts[parts.length - 2] ?? '') : (parts[0] ?? '');
      const host = Number(/:-\s*(\d+)/.exec(hostText)?.[1] ?? /(\d+)/.exec(hostText)?.[1] ?? 0);
      if (host) current.ports.push({ host, container });
      continue;
    }
    if (block === 'volumes' && item) {
      current.volumes.push(item);
      continue;
    }
    if (block === 'profiles' && item) {
      current.profiles.push(item);
      continue;
    }
    if (block === 'depends_on') {
      // Both "- postgres" and the long form "postgres:\n  condition: ...".
      if (item) current.dependsOn.push(item);
      else {
        const key = /^\s*([\w.-]+)\s*:\s*$/.exec(line)?.[1];
        if (key && key !== 'condition') current.dependsOn.push(key);
      }
      continue;
    }
    if (block === 'environment') {
      const key = item ? item.split('=')[0] : /^\s*([\w.]+)\s*:/.exec(line)?.[1];
      if (key) current.envKeys.push(key.trim());
      continue;
    }
  }
  if (current) services.push(current);
  return { services, lines };
}

/**
 * Read a Crux's compose file and say whether it may run.
 *
 * Refusals are deliberately blunt: anything that reaches outside the Crux
 * folder or above the person's own privileges is a no, with the reason named
 * so they can change the file rather than guess.
 */
export function inspectCompose(folder: string, file?: string): ComposeReading {
  const files = file ? [file] : composeFiles(folder, true);
  const blank = { services: [], profiles: [], variables: [] };
  if (!files.length)
    return { ...blank, files: [], refusals: ['There is no compose.yaml in this Crux.'] };

  const set = envNames(folder);
  const merged = new Map<string, ComposeService>();
  const variables = new Map<string, ComposeVariable>();
  const refusals: string[] = [];

  // Base first, then the override on top — the order Compose merges them.
  for (const name of files) {
    const at = path.join(folder, name);
    if (!fs.existsSync(at)) continue;
    const text = fs.readFileSync(at, 'utf8');
    variablesIn(text, variables, set);
    const { services, lines } = scanYaml(text);
    for (const service of services) {
      const already = merged.get(service.name);
      // An override adds to a service rather than replacing it, so a later
      // file's ports and mounts are added to what the base already asked for.
      merged.set(
        service.name,
        already
          ? {
              ...already,
              ...service,
              about: service.about ?? already.about,
              image: service.image ?? already.image,
              restart: service.restart ?? already.restart,
              healthcheck: already.healthcheck || service.healthcheck,
              ports: [...already.ports, ...service.ports],
              dependsOn: [...new Set([...already.dependsOn, ...service.dependsOn])],
              envKeys: [...new Set([...already.envKeys, ...service.envKeys])],
              volumes: [...new Set([...already.volumes, ...service.volumes])],
              profiles: [...new Set([...already.profiles, ...service.profiles])],
            }
          : service,
      );
    }
    for (const reason of refusalsIn(lines))
      refusals.push(files.length > 1 ? `${name}: ${reason}` : reason);
  }

  const services = [...merged.values()];
  return {
    services,
    files,
    refusals: [...new Set(refusals)],
    profiles: [...new Set(services.flatMap((s) => s.profiles))].sort(),
    variables: [...variables.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Why a file must not be started. Deliberately blunt: anything that reaches
 * outside the Crux folder, or above the person's own privileges, is a no with
 * the reason named so they can change the file rather than guess.
 */
function refusalsIn(lines: string[]): string[] {
  const refusals: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#/.test(line)) continue;
    if (/^privileged\s*:\s*true/.test(line))
      refusals.push('A service asks for privileged mode, which is the whole machine.');
    if (/^(network_mode|pid|ipc|userns_mode)\s*:\s*(["']?)host\2/.test(line))
      refusals.push(`A service asks to share the host's ${line.split(':')[0]}.`);
    if (/docker\.sock/.test(line))
      refusals.push('A service mounts the Docker socket, which is root on this machine.');
    if (/^-\s*(["']?)(\/|~|\$\{?HOME)/.test(line) && /:/.test(line))
      refusals.push(`A service mounts a path outside the Crux: ${line.replace(/^-\s*/, '')}`);
    if (/^-\s*(["']?)\.\.\//.test(line))
      refusals.push(`A service mounts a path above the Crux: ${line.replace(/^-\s*/, '')}`);
    if (/^\s*build\s*:/.test(raw) && /\.\./.test(raw))
      refusals.push('A service builds from a directory above the Crux.');
  }
  return [...new Set(refusals)];
}

/**
 * What this machine says, kept where it cannot travel.
 *
 * `compose.yaml` is the stack everyone shares and `.env` holds the defaults
 * everyone should get; both are ordinary Artifacts, so both are published and
 * exported with the Crux. Anything true only here — the ports this machine
 * assigned, an address that points at a service running from source — belongs
 * in `.crux/`, which is never ingested and therefore never travels.
 *
 *   `.crux/local.env`          values for `${NAME}`
 *   `.crux/local.compose.yaml` structural overrides, merged last
 */
export const LOCAL_ENV = '.crux/local.env';
export const LOCAL_COMPOSE = '.crux/local.compose.yaml';

/** Read one of this machine's own files for a Crux. */
export function readLocal(folder: string, file: string): string {
  try {
    return fs.readFileSync(path.join(folder, file), 'utf8');
  } catch {
    return '';
  }
}

/** Write one, making `.crux/` if this is the first. */
export function writeLocal(folder: string, file: string, text: string): void {
  if (file !== LOCAL_ENV && file !== LOCAL_COMPOSE) throw new Error(`Not a local file: ${file}`);
  const at = path.join(folder, file);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * The `-f` and `--env-file` arguments for a run.
 *
 * Compose finds `compose.yaml` and its override by itself, but naming them
 * explicitly is what lets the machine-local file be merged last. Likewise
 * `--env-file` turns off the automatic `.env`, so it is named too — and only
 * files that exist are named, because Compose fails on one that does not.
 */
export function fileArgs(folder: string): string[] {
  const args: string[] = [];
  const files = [...composeFiles(folder), LOCAL_COMPOSE];
  for (const file of files) if (fs.existsSync(path.join(folder, file))) args.push('-f', file);
  for (const file of ['.env', LOCAL_ENV])
    if (fs.existsSync(path.join(folder, file))) args.push('--env-file', file);
  return args;
}

/**
 * The files Compose will actually read, base first.
 *
 * Compose merges an override file over the base without being told to, which
 * is exactly how a stack carries sensible defaults and a machine carries its
 * own changes — and exactly why every one of them must be checked. A refusal
 * that only reads the base would let an override mount the disk.
 */
export function composeFiles(folder: string, includeLocal = false): string[] {
  const bases = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
  const overrides = [
    'compose.override.yaml',
    'compose.override.yml',
    'docker-compose.override.yaml',
    'docker-compose.override.yml',
  ];
  const found: string[] = [];
  const base = bases.find((name) => fs.existsSync(path.join(folder, name)));
  if (base) found.push(base);
  const override = overrides.find((name) => fs.existsSync(path.join(folder, name)));
  if (override) found.push(override);
  if (includeLocal && fs.existsSync(path.join(folder, LOCAL_COMPOSE))) found.push(LOCAL_COMPOSE);
  return found;
}

/**
 * The names set in the Crux's `.env`, which Compose reads by itself. Only the
 * names: a value there is the person's business, and the bench says whether a
 * setting is set, never what it is.
 */
function envNames(folder: string): Set<string> {
  const at = path.join(folder, '.env');
  if (!fs.existsSync(at)) return new Set();
  const names = new Set<string>();
  try {
    for (const line of fs.readFileSync(at, 'utf8').split('\n')) {
      const name = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
      if (name) names.add(name);
    }
  } catch {
    /* unreadable is the same as unset */
  }
  return names;
}

/** Every `${NAME}` and `${NAME:-default}` the files read. */
function variablesIn(text: string, into: Map<string, ComposeVariable>, set: Set<string>): void {
  for (const match of text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}/g)) {
    const name = match[1]!;
    const existing = into.get(name);
    const fallback = match[2];
    if (existing) {
      if (existing.fallback === undefined && fallback !== undefined) existing.fallback = fallback;
      continue;
    }
    into.set(name, { name, fallback, fromEnv: set.has(name) });
  }
}

/** The project name a Crux's containers carry, so nothing else is ever touched. */
export function projectName(cruxId: string): string {
  return `crux-${cruxId
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24)
    .toLowerCase()}`;
}

/** One service as Compose itself resolves it, after every file and `.env`. */
export interface ResolvedService {
  name: string;
  image?: string;
  /** Published ports: what the machine answers on, and what it reaches. */
  ports: { host: string; container: number; protocol?: string }[];
  /** The environment it will actually get, resolved. */
  environment: Record<string, string>;
  profiles: string[];
}

export interface ComposeResolution {
  services: ResolvedService[];
  /** Why Compose could not resolve the stack, if it could not. */
  error?: string;
}

/**
 * Ask Compose what the stack actually comes to.
 *
 * Our own reader describes the file — including the comments, which Compose
 * throws away — but only Compose knows what the ports and environment are
 * after `.env`, the override file and the active profiles have all been
 * applied. So the page shows what Compose says, and describes it with what the
 * file says.
 *
 * The Crux's secrets are deliberately **not** passed here: a secret is for the
 * run, not for a panel, and this way a `${PASSWORD}` shows as empty rather
 * than being printed on screen.
 */
export async function composeConfig(
  folder: string,
  profiles: string[] = [],
): Promise<ComposeResolution> {
  const runner = await composeRunner();
  if (!runner) return { services: [], error: 'No container runner on this machine.' };
  const args = ['compose', ...fileArgs(folder)];
  for (const profile of profiles) {
    if (!/^[\w.-]{1,64}$/.test(profile)) throw new Error(`Not a profile name: ${profile}`);
    args.push('--profile', profile);
  }
  args.push('config', '--format', 'json');
  const answer = await new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const proc = spawn(runner.program, args, { cwd: folder });
    let out = '';
    let err = '';
    proc.stdout?.on('data', (c: Buffer) => (out += String(c)));
    proc.stderr?.on('data', (c: Buffer) => (err += String(c)));
    proc.on('close', (code) => resolve({ code: code ?? -1, out, err }));
    proc.on('error', (error) => resolve({ code: -1, out: '', err: String(error) }));
  });
  if (answer.code !== 0)
    return { services: [], error: answer.err.trim().slice(0, 600) || 'Compose refused the file.' };
  try {
    const parsed = JSON.parse(answer.out) as {
      services?: Record<
        string,
        {
          image?: string;
          profiles?: string[];
          environment?: Record<string, string | null>;
          ports?: { target?: number; published?: string | number; protocol?: string }[];
        }
      >;
    };
    return {
      services: Object.entries(parsed.services ?? {}).map(([name, service]) => ({
        name,
        image: service.image,
        profiles: service.profiles ?? [],
        ports: (service.ports ?? [])
          .filter((port) => port.published !== undefined)
          .map((port) => ({
            host: String(port.published),
            container: Number(port.target ?? 0),
            protocol: port.protocol,
          })),
        environment: Object.fromEntries(
          Object.entries(service.environment ?? {}).map(([key, value]) => [key, value ?? '']),
        ),
      })),
    };
  } catch (error) {
    return { services: [], error: `Could not read Compose's answer — ${(error as Error).message}` };
  }
}

/**
 * Which of these host ports something is already listening on.
 *
 * A stack that will not start because port 5432 is taken is the commonest
 * disappointment there is, and it is answerable before anything runs.
 */
export async function portsInUse(ports: number[]): Promise<number[]> {
  const net = await import('net');
  const checks = [...new Set(ports)].map(
    (port) =>
      new Promise<number | null>((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(port));
        server.once('listening', () => server.close(() => resolve(null)));
        server.listen(port, '127.0.0.1');
      }),
  );
  return (await Promise.all(checks)).filter((port): port is number => port !== null);
}

/** A free host port at or after `from`, for offering a way out of a collision. */
export async function freePort(from = 8000): Promise<number> {
  for (let port = from; port < from + 400; port++) {
    if (!(await portsInUse([port])).length) return port;
  }
  return 0;
}

/**
 * The stack, as something else can connect to.
 *
 * A running stack is only useful to the code beside it if that code knows
 * where it is. This turns the resolved services into the environment a
 * neighbour needs — `DATABASE_URL`, `REDIS_URL`, a base URL per service — so
 * an API you are working on locally can point at the database this Crux runs
 * without anyone copying port numbers by hand.
 *
 * Everything here comes from what Compose resolved, so it stays right when a
 * port is overridden.
 */
export function connectionsFor(services: ResolvedService[]): Record<string, string> {
  const out: Record<string, string> = {};
  const upper = (name: string) => name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
  for (const service of services) {
    const first = service.ports[0];
    if (!first) continue;
    const port = first.host.includes(':')
      ? (first.host.split(':').pop() ?? first.host)
      : first.host;
    const image = (service.image ?? '').toLowerCase();
    out[`${upper(service.name)}_PORT`] = port;
    out[`${upper(service.name)}_HOST`] = '127.0.0.1';

    // The shapes a neighbour actually asks for, for the services people run.
    const env = service.environment ?? {};
    if (/postgres/.test(image)) {
      const user = env.POSTGRES_USER || 'postgres';
      const password = env.POSTGRES_PASSWORD || '';
      const database = env.POSTGRES_DB || user;
      out.DATABASE_URL = `postgresql://${user}${password ? `:${password}` : ''}@127.0.0.1:${port}/${database}`;
    } else if (/redis|valkey/.test(image)) {
      out.REDIS_URL = `redis://127.0.0.1:${port}`;
    } else if (/mongo/.test(image)) {
      out.MONGO_URL = `mongodb://127.0.0.1:${port}`;
    } else if (/minio/.test(image)) {
      out.S3_ENDPOINT = `http://127.0.0.1:${port}`;
    } else {
      out[`${upper(service.name)}_URL`] = `http://127.0.0.1:${port}`;
    }
  }
  return out;
}

/** The line that marks an override file as this app's to rewrite. */
export const OVERRIDE_HEADER = '# Written by Crux Garden. Yours to edit — once you do, it keeps';

export interface OverrideWish {
  service: string;
  /** Host port per container port: { "5432": "55432" }. */
  ports?: Record<string, string>;
  /** Environment to set for this service. */
  environment?: Record<string, string>;
}

/**
 * Write the machine's own overrides, as a file Compose merges over the stack.
 *
 * Changing a port or a setting must never touch `compose.yaml` — that file is
 * the one everyone shares, and rewriting someone's YAML by hand loses their
 * comments and their formatting. So the app owns a second file and writes it
 * whole, from what the panel says.
 *
 * If that file was written by hand, the app will not touch it: it hands back
 * the snippet instead, and the person pastes it where they want. Silently
 * reformatting someone's file is worse than asking.
 */
export function writeOverride(
  folder: string,
  wishes: OverrideWish[],
  file = 'compose.override.yaml',
): { written: boolean; snippet: string } {
  const lines: string[] = [];
  for (const wish of wishes) {
    const ports = Object.entries(wish.ports ?? {}).filter(([, host]) => host);
    const env = Object.entries(wish.environment ?? {});
    if (!ports.length && !env.length) continue;
    lines.push(`  ${wish.service}:`);
    if (ports.length) {
      lines.push('    ports:');
      for (const [container, host] of ports) lines.push(`      - "${host}:${container}"`);
    }
    if (env.length) {
      lines.push('    environment:');
      for (const [key, value] of env) lines.push(`      ${key}: ${JSON.stringify(value)}`);
    }
  }
  const snippet = lines.length ? `services:\n${lines.join('\n')}\n` : '';
  const at = path.join(folder, file);
  const body = [
    OVERRIDE_HEADER,
    '# what you wrote and stops managing this file. Compose merges it over',
    '# compose.yaml, so the stack everyone shares is untouched.',
    '',
    snippet || '# Nothing overridden.',
  ].join('\n');

  if (fs.existsSync(at)) {
    const existing = fs.readFileSync(at, 'utf8');
    if (!existing.startsWith(OVERRIDE_HEADER)) return { written: false, snippet };
  }
  fs.writeFileSync(at, body.endsWith('\n') ? body : `${body}\n`);
  return { written: true, snippet };
}

/** What the app previously wrote there, so the panel opens with it filled in. */
export function readOverride(folder: string, file = 'compose.override.yaml'): OverrideWish[] {
  const at = path.join(folder, file);
  if (!fs.existsSync(at)) return [];
  const text = fs.readFileSync(at, 'utf8');
  if (!text.startsWith(OVERRIDE_HEADER)) return [];
  const { services } = scanYaml(text);
  return services.map((service) => ({
    service: service.name,
    ports: Object.fromEntries(
      service.ports.map((port) => [String(port.container ?? port.host), String(port.host)]),
    ),
  }));
}

export interface ComposeRunOptions {
  cruxId: string;
  folder: string;
  verb: ComposeVerb;
  /** Extra arguments, checked against a short list — never free-form. */
  service?: string;
  tail?: number;
  timeoutMs?: number;
  /** Compose profiles to include, for the optional parts of a stack. */
  profiles?: string[];
  /**
   * The command for `run` or `exec`, as a list. Empty runs the service's own
   * command, which is what a one-shot job usually wants.
   */
  command?: string[];
  /**
   * Wait until everything started is healthy before answering (`up --wait`).
   * What a task needs: the suite should meet a database that is ready, not one
   * that has merely been created.
   */
  wait?: boolean;
  /**
   * Settings handed to Compose as environment, for `${NAME}` the file reads.
   * The Crux's secrets arrive this way so a password never has to be written
   * into a file that gets published.
   */
  env?: Record<string, string>;
}

/**
 * Run one compose verb for a Crux. Output is streamed line by line through
 * `onLine`, because pulling images is slow and silence looks like a hang.
 */
export async function runCompose(
  opts: ComposeRunOptions,
  onLine: (line: string) => void,
): Promise<{ code: number; output: string }> {
  const runner = await composeRunner();
  if (!runner)
    throw new Error(
      'Docker is not on this machine. Install Docker Desktop (docker.com) or Podman, then look again.',
    );
  if (!COMPOSE_VERBS.includes(opts.verb)) throw new Error(`Not allowed: ${opts.verb}`);
  if (opts.service && !/^[\w.-]{1,64}$/.test(opts.service))
    throw new Error(`Not a service name: ${opts.service}`);
  if ((opts.verb === 'run' || opts.verb === 'exec') && !opts.service)
    throw new Error(`${opts.verb} needs a service to run in.`);
  for (const part of opts.command ?? [])
    if (typeof part !== 'string' || part.includes('\0')) throw new Error('Bad command.');
  for (const profile of opts.profiles ?? [])
    if (!/^[\w.-]{1,64}$/.test(profile)) throw new Error(`Not a profile name: ${profile}`);
  for (const name of Object.keys(opts.env ?? {}))
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Not a setting name: ${name}`);

  // `run` builds a container from the same file, so it is checked like a start.
  if (opts.verb === 'up' || opts.verb === 'start' || opts.verb === 'run') {
    const reading = inspectCompose(opts.folder);
    if (reading.refusals.length)
      throw new Error(`This stack was not started.\n- ${reading.refusals.join('\n- ')}`);
  }

  return new Promise((resolve, reject) => {
    const args = ['compose', ...fileArgs(opts.folder), '--project-name', projectName(opts.cruxId)];
    for (const profile of opts.profiles ?? []) args.push('--profile', profile);
    if (opts.verb === 'up') {
      args.push('up', '--detach', '--remove-orphans');
      // Compose waits for healthchecks itself, which is more reliable than
      // polling `ps` from out here.
      if (opts.wait) args.push('--wait');
      // `-T` because there is no terminal here: without it Compose tries to
      // allocate one and the command fails or hangs.
    } else if (opts.verb === 'run') args.push('run', '--rm', '-T');
    else if (opts.verb === 'exec') args.push('exec', '-T');
    else if (opts.verb === 'down') args.push('down', '--remove-orphans');
    else if (opts.verb === 'logs')
      args.push('logs', '--no-color', '--tail', String(Math.min(opts.tail ?? 200, 2000)));
    else if (opts.verb === 'ps') args.push('ps', '--format', 'json');
    else args.push(opts.verb);
    if (opts.service && opts.verb !== 'down') args.push(opts.service);
    // Everything after the service name is the command, passed as arguments.
    if (opts.verb === 'run' || opts.verb === 'exec') args.push(...(opts.command ?? []));

    const proc = spawn(runner.program, args, {
      cwd: opts.folder,
      env: {
        ...process.env,
        ...(opts.env ?? {}),
        COMPOSE_PROJECT_NAME: projectName(opts.cruxId),
      },
    });
    let output = '';
    const feed = (chunk: Buffer) => {
      const text = String(chunk);
      output += text;
      if (output.length > 400_000) output = output.slice(-200_000);
      for (const line of text.split('\n')) if (line.trim()) onLine(line.trim());
    };
    proc.stdout?.on('data', feed);
    proc.stderr?.on('data', feed);
    const timer = setTimeout(
      () => proc.kill('SIGTERM'),
      Math.min(opts.timeoutMs ?? 10 * 60_000, 30 * 60_000),
    );
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
