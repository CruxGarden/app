/** A Crux owns its Compose project; every operation uses one validated snapshot.
 * The bench, Runner and agents share this module. Compose loading and host-access
 * policy live in compose-project; no command reloads unchecked Project Folder files.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Document, isSeq } from 'yaml';
import {
  prepareComposeControl,
  verifyExistingCompose,
  verifyComposeResources,
} from './compose-lifecycle';
import {
  composeFiles,
  composeName,
  composePath,
  composeProcess,
  composeProcessEnvironment,
  composeVariables,
  mapping,
  parseCompose,
  prepareComposeProject,
  readComposeFile,
  writeComposeFile,
  validateCompose,
  LOCAL_ENV,
  LOCAL_COMPOSE,
} from './compose-project';
export { composeFiles, LOCAL_ENV, LOCAL_COMPOSE } from './compose-project';

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
  // host shell command. The service must belong to the prepared project;
  // command arguments follow that validated service name.
  'run',
  'exec',
] as const;
export type ComposeVerb = (typeof COMPOSE_VERBS)[number];

export interface ComposeRunner {
  /** Absolute path of the Docker or Podman executable that answered. */
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
  ports: { host: number; container?: number; protocol?: string; hostIp?: string }[];
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
    execFile(
      program,
      args,
      { timeout, env: composeProcessEnvironment(), killSignal: 'SIGKILL', maxBuffer: 64_000 },
      (error, stdout) => {
        resolve(error ? null : String(stdout || '').trim());
      },
    );
  });
}

/**
 * Whether this machine can run a stack, and with what. Docker Desktop is not
 * free for larger companies and Podman speaks the same commands, so either is
 * accepted and the answer says which one replied.
 */
export async function composeRunner(refresh = false): Promise<ComposeRunner | null> {
  if (runnerCache !== undefined && !refresh) return runnerCache;
  for (const command of ['docker', 'podman']) {
    const program = findRunner(command);
    if (!program) continue;
    const version = await ask(program, ['compose', 'version']);
    if (version) {
      runnerCache = { program, version: version.split('\n')[0] ?? version };
      return runnerCache;
    }
  }
  runnerCache = null;
  return null;
}

function findRunner(command: string): string | null {
  const executable = process.platform === 'win32' ? `${command}.exe` : command;
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, executable);
    try {
      if (!fs.statSync(candidate).isFile()) continue;
      fs.accessSync(
        candidate,
        process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
      );
      return fs.realpathSync(candidate);
    } catch {
      /* Try the next trusted PATH directory. */
    }
  }
  return null;
}

export function clearComposeRunnerCache(): void {
  runnerCache = undefined;
}

/** Preview metadata comes from parsed YAML. Execution additionally resolves and
 * validates all variables and merges through prepareComposeProject. */
export function inspectCompose(folder: string, file?: string): ComposeReading {
  const files = file ? [file] : composeFiles(folder, true);
  const blank = { services: [], profiles: [], variables: [] };
  if (!files.length)
    return { ...blank, files, refusals: ['There is no compose.yaml in this Crux.'] };
  // Containment errors remain errors rather than masquerading as missing files.
  for (const name of files) composePath(folder, name);
  const merged = new Map<string, ComposeService>();
  const variables = new Map<string, ComposeVariable>();
  const refusals: string[] = [];
  try {
    const set = new Set(Object.keys(composeVariables(folder)));
    for (const name of files) {
      const text = readComposeFile(folder, name);
      const parsed = parseCompose(text);
      validateCompose(parsed.model, folder);
      variablesIn(text, variables, set);
      for (const [key, raw] of Object.entries(mapping(parsed.model.services ?? {}, 'services'))) {
        const service = describeService(key, mapping(raw, key), parsed.comments[key]);
        const before = merged.get(key);
        merged.set(
          key,
          before
            ? {
                ...before,
                ...service,
                image: service.image ?? before.image,
                about: service.about ?? before.about,
                restart: service.restart ?? before.restart,
                healthcheck: before.healthcheck || service.healthcheck,
                ports: parsed.portOverrides.has(key)
                  ? service.ports
                  : [...before.ports, ...service.ports],
                dependsOn: [...new Set([...before.dependsOn, ...service.dependsOn])],
                envKeys: [...new Set([...before.envKeys, ...service.envKeys])],
                profiles: [...new Set([...before.profiles, ...service.profiles])],
                volumes: [...new Set([...before.volumes, ...service.volumes])],
              }
            : service,
        );
      }
    }
  } catch (error) {
    refusals.push((error as Error).message);
  }
  const services = [...merged.values()];
  return {
    services,
    files,
    refusals,
    profiles: [...new Set(services.flatMap((service) => service.profiles))].sort(),
    variables: [...variables.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function describeService(
  name: string,
  service: Record<string, unknown>,
  about?: string,
): ComposeService {
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const ports = list(service.ports).flatMap((port) => {
    if (typeof port === 'object' && port) {
      const entry = port as { published?: string; target?: number };
      return entry.published
        ? [{ host: Number(entry.published), container: Number(entry.target) }]
        : [];
    }
    const text = String(port).replace(
      /\$\{[^}:]+(?::?-([^}]*))?\}/g,
      (_match, fallback: string) => fallback ?? '',
    );
    const parts = text.split(':');
    const container = Number(parts.at(-1)?.split('/')[0]);
    const host = Number(parts.length > 1 ? parts.at(-2) : parts[0]);
    return host ? [{ host, container }] : [];
  });
  return {
    name,
    about,
    image: typeof service.image === 'string' ? service.image : undefined,
    restart: typeof service.restart === 'string' ? service.restart : undefined,
    healthcheck: !!service.healthcheck,
    ports,
    dependsOn: Array.isArray(service.depends_on)
      ? service.depends_on.map(String)
      : Object.keys(service.depends_on ?? {}),
    envKeys: Array.isArray(service.environment)
      ? service.environment.map((entry) => String(entry).split('=')[0]!)
      : Object.keys(service.environment ?? {}),
    volumes: list(service.volumes).map((entry) =>
      typeof entry === 'string' ? entry : JSON.stringify(entry),
    ),
    profiles: list(service.profiles).map(String),
  };
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

/** Read one of this machine's own files for a Crux. */
export function readLocal(folder: string, file: string): string {
  localFilePath(folder, file);
  try {
    return readComposeFile(folder, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

function localFilePath(folder: string, file: string): string {
  if (file !== LOCAL_ENV && file !== LOCAL_COMPOSE) throw new Error(`Not a local file: ${file}`);
  return composePath(folder, file);
}

/** Write one, making `.crux/` if this is the first. */
export function writeLocal(folder: string, file: string, text: string): void {
  localFilePath(folder, file);
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Local configuration exceeds 1 MiB.');
  writeComposeFile(folder, file, text.endsWith('\n') ? text : `${text}\n`);
}

/** Every `${NAME}` and `${NAME:-default}` the files read. */
function variablesIn(text: string, into: Map<string, ComposeVariable>, set: Set<string>): void {
  for (const match of text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[?+-])([^}]*))?\}/g)) {
    const name = match[1]!;
    const existing = into.get(name);
    const fallback = match[2]?.endsWith('-') ? match[3] : undefined;
    if (existing) {
      if (existing.fallback === undefined && fallback !== undefined) existing.fallback = fallback;
      continue;
    }
    into.set(name, { name, fallback, fromEnv: set.has(name) });
  }
}

/** The project name a Crux's containers carry, so nothing else is ever touched. */
export function projectName(cruxId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cruxId))
    throw new Error('Compose needs a Crux UUID.');
  // This namespace also owns existing named volumes; do not rename it during
  // a runner refactor. Changing it requires an explicit data migration.
  return `crux-${cruxId.replaceAll('-', '').slice(0, 24).toLowerCase()}`;
}

/** One service as Compose itself resolves it, after every file and `.env`. */
export interface ResolvedService extends Omit<ComposeService, 'ports'> {
  name: string;
  image?: string;
  /** Published ports: what the machine answers on, and what it reaches. */
  ports: { host: string; container: number; protocol?: string; hostIp?: string }[];
  /** The environment it will actually get, resolved. */
  environment: Record<string, string>;
  profiles: string[];
}

export interface ComposeResolution {
  services: ResolvedService[];
  /** Why Compose could not resolve the stack, if it could not. */
  error?: string;
}

function redactSecrets(text: string, secrets: Record<string, string>): string {
  for (const value of Object.values(secrets)
    .filter((value) => typeof value === 'string' && value.length > 0)
    .sort((a, b) => b.length - a.length))
    text = text.replaceAll(value, () => '[secret]');
  return text;
}

const PRIVATE_METADATA_ERROR =
  'A secret is used in public service metadata. Keep secrets in container environment or commands.';

function privateConfigurationError(error: Error, secrets: Record<string, string>): string {
  // CLI diagnostics can quote or otherwise transform values. Do not attempt
  // to recognize every representation of a secret in an arbitrary diagnostic.
  return Object.keys(secrets).length && error.message !== PRIVATE_METADATA_ERROR
    ? 'Cannot resolve this stack with its private settings. Check the configuration and required secrets.'
    : error.message;
}

function requirePublicMetadata(value: unknown, secrets: Record<string, string>): void {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      requirePublicMetadata(key, secrets);
      requirePublicMetadata(child, secrets);
    }
  } else if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value);
    if (redactSecrets(text, secrets) !== text) throw new Error(PRIVATE_METADATA_ERROR);
  }
}

/** Resolve with the execution inputs, but never expose private values to the bench. */
export async function composeConfig(
  folder: string,
  profiles: string[] = [],
  secrets: Record<string, string> = {},
): Promise<ComposeResolution> {
  const runner = await composeRunner();
  if (!runner) return { services: [], error: 'No container runner on this machine.' };
  try {
    const project = await prepareComposeProject(
      runner.program,
      folder,
      'crux-preview',
      profiles,
      secrets,
    );
    try {
      for (const [name, service] of Object.entries(project.model.services)) {
        requirePublicMetadata(name, secrets);
        // Check raw values before serializing mount descriptions: escaping a
        // newline or quote must not hide a private value from this check.
        requirePublicMetadata(
          Object.fromEntries(
            Object.entries(service).filter(
              ([key]) => !['environment', 'command', 'entrypoint', 'healthcheck'].includes(key),
            ),
          ),
          secrets,
        );
      }
      const services = Object.entries(project.model.services).map(([name, service]) => ({
        ...describeService(name, service),
        name,
        image: service.image as string,
        profiles: (service.profiles ?? []) as string[],
        ports: (
          (service.ports ?? []) as {
            published?: string | number;
            target: number;
            protocol?: string;
            host_ip?: string;
          }[]
        )
          .filter((port) => port.published !== undefined)
          .map((port) => ({
            host: String(port.published),
            container: Number(port.target),
            protocol: port.protocol,
            hostIp: port.host_ip,
          })),
        environment: Object.fromEntries(
          Object.entries((service.environment ?? {}) as Record<string, unknown>).map(
            ([key, value]) => [key, redactSecrets(String(value ?? ''), secrets)],
          ),
        ),
      }));
      for (const service of services) {
        requirePublicMetadata(
          Object.fromEntries(Object.entries(service).filter(([key]) => key !== 'environment')),
          secrets,
        );
      }
      return { services };
    } finally {
      project.dispose();
    }
  } catch (error) {
    return { services: [], error: privateConfigurationError(error as Error, secrets) };
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
      // A copied connection string must not pretend redacted credentials work.
      if (
        ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'].some((key) =>
          env[key]?.includes('[secret]'),
        )
      )
        continue;
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
 * whole, merging the panel’s changes into the existing managed settings.
 *
 * If that file was written by hand, the app will not touch it: it hands back
 * the snippet instead, and the person pastes it where they want. Silently
 * reformatting someone's file is worse than asking.
 */
export async function writeOverride(
  folder: string,
  wishes: OverrideWish[],
  file = 'compose.override.yaml',
  secrets: Record<string, string> = {},
): Promise<{ written: boolean; snippet: string }> {
  const at = overridePath(folder, file);
  if (!Array.isArray(wishes) || wishes.length > 100)
    throw new Error('Choose at most 100 service overrides.');
  const existing = fs.existsSync(at) ? readComposeFile(folder, file) : '';
  const managed = !existing || existing.startsWith(OVERRIDE_HEADER);
  const services =
    managed && existing
      ? mapping(parseCompose(existing).model.services ?? {}, 'services')
      : (Object.create(null) as Record<string, unknown>);

  // The panel sends changes, not a replacement document. Validate all of them
  // before resolving or writing, then retain the other managed settings.
  const seen = new Set<string>();
  for (const wish of wishes) {
    if (!wish || typeof wish !== 'object') throw new Error('Invalid service override.');
    composeName(wish.service, 'service name');
    if (seen.has(wish.service)) throw new Error('Choose one override per service.');
    seen.add(wish.service);
    for (const [container, host] of Object.entries(mapping(wish.ports ?? {}, 'ports'))) {
      for (const value of [container, host])
        if (
          typeof value !== 'string' ||
          !/^[0-9]{1,5}$/.test(value) ||
          Number(value) < 1 ||
          Number(value) > 65535
        )
          throw new Error('Choose port numbers between 1 and 65535.');
    }
    for (const [key, value] of Object.entries(mapping(wish.environment ?? {}, 'environment')))
      if (
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) ||
        typeof value !== 'string' ||
        value.includes('\0') ||
        value.length > 64_000
      )
        throw new Error(`Invalid environment override: ${key}`);
  }
  const portChanges = wishes.some((wish) => Object.keys(wish.ports ?? {}).length);
  const runner = portChanges ? await composeRunner() : null;
  if (portChanges && !runner)
    throw new Error('A Compose runner is needed to preserve existing ports.');
  const prepared = runner
    ? await prepareComposeProject(runner.program, folder, 'crux-preview', [], secrets).catch(
        (error: Error) => {
          throw new Error(privateConfigurationError(error, secrets));
        },
      )
    : null;
  try {
    for (const wish of wishes) {
      const previous = Object.hasOwn(services, wish.service)
        ? mapping(services[wish.service], wish.service)
        : {};
      const service = { ...previous };
      if (Object.keys(wish.ports ?? {}).length) {
        const resolved = prepared!.model.services[wish.service];
        if (!resolved) throw new Error(`The stack has no service named ${wish.service}.`);
        const ports = ((resolved.ports ?? []) as Record<string, unknown>[]).map((port) => ({
          ...mapping(port, 'resolved port'),
        }));
        for (const [container, host] of Object.entries(wish.ports!)) {
          const matches = ports.filter((port) => Number(port.target) === Number(container));
          if (!matches.length)
            throw new Error(`Service ${wish.service} does not publish port ${container}.`);
          for (const port of matches) {
            port.published = host;
            port.host_ip = '127.0.0.1';
          }
        }
        service.ports = ports;
      }
      if (Object.keys(wish.environment ?? {}).length) {
        service.environment = {
          ...mapping(service.environment ?? {}, 'environment'),
          ...Object.fromEntries(
            Object.entries(wish.environment!).map(([key, value]) => [
              key,
              value.replaceAll('$', () => '$$'),
            ]),
          ),
        };
      }
      Object.defineProperty(services, wish.service, {
        value: service,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    requirePublicMetadata(services, secrets);
    const document = new Document({ services });
    for (const name of Object.keys(services)) {
      const ports = document.getIn(['services', name, 'ports'], true);
      if (isSeq(ports)) ports.tag = '!override';
    }
    const snippet = Object.keys(services).length ? document.toString() : '';
    if (Buffer.byteLength(snippet) > 1024 * 1024) throw new Error('Overrides exceed 1 MiB.');
    if (!managed) return { written: false, snippet };
    const body = [
      OVERRIDE_HEADER,
      '# what you wrote and stops managing this file. Compose merges it over',
      '# compose.yaml, so the stack everyone shares is untouched.',
      '',
      snippet || '# Nothing overridden.',
    ].join('\n');
    // Resolution may take time. Do not overwrite an intervening editor's work.
    const current = fs.existsSync(at) ? readComposeFile(folder, file) : '';
    if (current !== existing)
      throw new Error('The override file changed while saving. Refresh and try again.');
    writeComposeFile(folder, file, body.endsWith('\n') ? body : `${body}\n`);
    return { written: true, snippet };
  } finally {
    prepared?.dispose();
  }
}

function overridePath(folder: string, file: string): string {
  if (file !== 'compose.override.yaml' && file !== LOCAL_COMPOSE)
    throw new Error('Not a managed Compose override file.');
  return composePath(folder, file);
}

/** What the app previously wrote there, so the panel opens with it filled in. */
export function readOverride(folder: string, file = 'compose.override.yaml'): OverrideWish[] {
  const at = overridePath(folder, file);
  if (!fs.existsSync(at)) return [];
  const text = readComposeFile(folder, file);
  if (!text.startsWith(OVERRIDE_HEADER)) return [];
  const parsed = parseCompose(text);
  return Object.entries(mapping(parsed.model.services ?? {}, 'services'))
    .map(([name, raw]) => describeService(name, mapping(raw, name)))
    .map((service) => ({
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
  if (!COMPOSE_VERBS.includes(opts.verb)) throw new Error(`Not allowed: ${opts.verb}`);
  const name = projectName(opts.cruxId);
  if (opts.service !== undefined) composeName(opts.service, 'service name');
  if ((opts.verb === 'run' || opts.verb === 'exec') && !opts.service)
    throw new Error(`${opts.verb} needs a service to run in.`);
  if (
    opts.command &&
    (!Array.isArray(opts.command) ||
      opts.command.length > 256 ||
      opts.command.some(
        (part) => typeof part !== 'string' || part.includes('\0') || part.length > 16_000,
      ))
  )
    throw new Error('Choose a bounded command argument list.');
  if (
    opts.tail !== undefined &&
    (!Number.isInteger(opts.tail) || opts.tail < 0 || opts.tail > 2000)
  )
    throw new Error('Choose a log tail between 0 and 2000.');
  const runner = await composeRunner();
  if (!runner) throw new Error('Install Docker Desktop or Podman to run a Stack.');
  const controlOnly = ['stop', 'down', 'ps', 'logs'].includes(opts.verb);
  const project = controlOnly
    ? await prepareComposeControl(runner.program, name, opts.verb === 'down')
    : await prepareComposeProject(runner.program, opts.folder, name, opts.profiles, opts.env);
  try {
    if (['up', 'start', 'exec', 'run'].includes(opts.verb))
      await verifyComposeResources(runner.program, name, project);
    if (['start', 'exec', 'run'].includes(opts.verb))
      await verifyExistingCompose(runner.program, name, project);
    if (opts.service && !Object.hasOwn(project.model.services, opts.service))
      throw new Error(`The stack has no service named ${opts.service}.`);
    const args = [...project.args];
    if (opts.verb === 'up') {
      args.push('up', '--detach', '--remove-orphans');
      if (opts.wait) args.push('--wait');
    } else if (opts.verb === 'run') args.push('run', '--rm', '-T');
    else if (opts.verb === 'exec') args.push('exec', '-T');
    else if (opts.verb === 'down') args.push('down', '--remove-orphans');
    else if (opts.verb === 'logs')
      args.push('logs', '--no-color', '--tail', String(opts.tail ?? 200));
    else if (opts.verb === 'ps') args.push('ps', '--all', '--format', 'json');
    else args.push(opts.verb);
    if (opts.service && opts.verb !== 'down') args.push(opts.service);
    if (opts.verb === 'run' || opts.verb === 'exec') args.push(...(opts.command ?? []));
    const result = await composeProcess(runner.program, args, {
      cwd: project.directory,
      env: project.env,
      timeoutMs: opts.timeoutMs ?? 10 * 60_000,
      onLine,
    });
    return { code: result.code, output: (result.stdout + result.stderr).slice(-200_000) };
  } finally {
    project.dispose();
  }
}
