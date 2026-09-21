import type { WorkspaceService } from '@/services/workspace';

/**
 * The workspace's configuration (ADR 0053): ports and addresses.
 *
 * The Runner owns this so there is one place to look, and everything here is
 * pure, so the rules can be read and tested without a garden:
 *
 *   · a declared port is kept when it is free, because 5432 should stay 5432;
 *   · anything else gets the next free port, and then **sticks** — a port that
 *     moves every morning breaks a redirect URI registered somewhere else;
 *   · an address is generated for each consumer, because "where is Postgres"
 *     has three right answers at once, depending on where you ask from.
 */
export interface PortAssignment {
  service: string;
  /** What the file asked for, when it asked. */
  declared?: number;
  /** What this machine will actually use. */
  port: number;
  /** Why it is not the declared one. */
  moved?: string;
}

export interface AssignOptions {
  /** Host ports something else on this machine is already listening on. */
  taken: number[];
  /** What was assigned last time, which is kept wherever it still can be. */
  remembered?: Record<string, number>;
  /** Where to start looking when a port has to move. */
  from?: number;
}

/**
 * Give every service that publishes a port one this machine can use.
 *
 * A remembered port wins, then the declared one, then the next free. The scan
 * is what makes this "based on what you're currently running" (Daniel), and
 * the memory is what makes it stick.
 */
export function assignPorts(services: WorkspaceService[], opts: AssignOptions): PortAssignment[] {
  const used = new Set(opts.taken);
  const out: PortAssignment[] = [];
  let next = opts.from ?? 8000;
  const free = (port: number) => port >= 1024 && port <= 65535 && !used.has(port);
  const nextFree = () => {
    while (!free(next)) next++;
    return next;
  };

  for (const service of services) {
    const declared = service.ports[0]?.host;
    const remembered = opts.remembered?.[service.name];

    // What was chosen before, if it is still available: stability first.
    if (remembered && free(remembered)) {
      used.add(remembered);
      out.push({
        service: service.name,
        declared,
        port: remembered,
        moved:
          declared && declared !== remembered
            ? `kept from last time; ${declared} was taken when this workspace was first opened`
            : undefined,
      });
      continue;
    }
    if (!declared && !remembered) continue; // nothing to publish

    if (declared && free(declared)) {
      used.add(declared);
      out.push({ service: service.name, declared, port: declared });
      continue;
    }

    const port = nextFree();
    used.add(port);
    out.push({
      service: service.name,
      declared,
      port,
      moved: remembered
        ? `${remembered} is in use by something else, so this moved`
        : `${declared} is in use by something else, so this moved`,
    });
  }
  return out;
}

export interface AddressOptions {
  /** Where the consumer runs: in a container, or on this machine. */
  consumer: 'container' | 'host';
}

/**
 * Where a service is, from where you are asking.
 *
 * Inside Compose a service is its own name. From the host it is 127.0.0.1 and
 * the published port. From a container reaching a service that runs on the
 * host it is `host.docker.internal` — which is why a source-run service needs
 * the Stack to carry a host-gateway entry.
 */
export function addressOf(
  service: WorkspaceService,
  port: number | undefined,
  opts: AddressOptions,
): { host: string; port?: number } {
  if (service.from === 'source')
    return opts.consumer === 'container'
      ? { host: 'host.docker.internal', port }
      : { host: '127.0.0.1', port };
  return opts.consumer === 'container'
    ? { host: service.name, port: service.ports[0]?.container ?? port }
    : { host: '127.0.0.1', port };
}

/**
 * What a consumer needs in its environment to reach the workspace.
 *
 * Only what can be generated: a URL the Runner did not write is left alone and
 * reported, rather than rewritten by guessing at what a string means.
 */
export function connectionsFor(
  services: WorkspaceService[],
  ports: Record<string, number>,
  opts: AddressOptions,
): Record<string, string> {
  const out: Record<string, string> = {};
  const upper = (name: string) => name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

  for (const service of services) {
    const port = ports[service.name];
    const at = addressOf(service, port, opts);
    if (!at.port) continue;
    const image = (service.image ?? '').toLowerCase();
    out[`${upper(service.name)}_HOST`] = at.host;
    out[`${upper(service.name)}_PORT`] = String(at.port);

    // The shapes people actually ask for. A database URL needs credentials
    // the compose file holds, so the host and port are given and the URL is
    // left to whoever knows the rest — saying less rather than guessing.
    if (/postgres/.test(image)) {
      out.DATABASE_HOST = at.host;
      out.DATABASE_PORT = String(at.port);
    } else if (/redis|valkey/.test(image)) {
      out.REDIS_URL = `redis://${at.host}:${at.port}`;
    } else if (/mongo/.test(image)) {
      out.MONGO_URL = `mongodb://${at.host}:${at.port}`;
    } else if (/minio/.test(image)) {
      out.S3_ENDPOINT = `http://${at.host}:${at.port}`;
    } else {
      out[`${upper(service.name)}_URL`] = `http://${at.host}:${at.port}`;
    }
  }
  return out;
}

/** `.env` text from a map, sorted so a diff is about what changed. */
export function envText(values: Record<string, string>, header: string[]): string {
  const lines = [...header.map((line) => `# ${line}`), ''];
  for (const name of Object.keys(values).sort()) lines.push(`${name}=${values[name]}`);
  return `${lines.join('\n')}\n`;
}

/** The names set in an env file, with their values. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(text || '').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) out[match[1]!] = match[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * The machine-local Compose file: the ports this machine chose, and a way for
 * containers to reach anything running from source.
 *
 * Generated whole and written to `.crux/local.compose.yaml`, which Compose
 * merges last and which never travels.
 */
export function localComposeFor(
  services: WorkspaceService[],
  ports: Record<string, number>,
  hostServices: string[],
): string {
  const lines = [
    '# Written by the Runner. This machine only: never ingested, never shared.',
    '# It is merged over compose.yaml and your own compose.override.yaml.',
    '',
    'services:',
  ];
  let wrote = false;

  for (const service of services) {
    if (service.from !== 'stack') continue;
    const port = ports[service.name];
    const declared = service.ports[0];
    const needsPort = port && declared && port !== declared.host;
    // A container that may need to reach a service running on this machine.
    const needsGateway = hostServices.length > 0;
    if (!needsPort && !needsGateway) continue;
    lines.push(`  ${service.name}:`);
    if (needsPort) {
      lines.push('    ports:');
      lines.push(`      - "${port}:${declared!.container ?? declared!.host}"`);
    }
    if (needsGateway) {
      // Linux has no host.docker.internal unless the file says so.
      lines.push('    extra_hosts:');
      lines.push('      - "host.docker.internal:host-gateway"');
    }
    wrote = true;
  }

  return wrote ? `${lines.join('\n')}\n` : '';
}
