#!/usr/bin/env node
/** Dependency-free desktop companion. The running app owns every operation and approval. */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const HELP = `Crux Garden desktop companion

Usage: crux [--config FILE | --folder DIR | --profile DIR] [--json] COMMAND
  status                  Check the selected Agent Host
  list                    List Cruxes (whole garden access)
  open ID                 Open a Crux in the app (whole garden access)
  tools                   Discover available tools and their input schemas
  call NAME [JSON | -]     Call a tool; '-' reads JSON from stdin
  help                    Show this help

Examples:
  crux list
  crux open <crux-id>
  crux --folder ./my-project tools --json
  crux --folder ./my-project call read_file '{"path":"index.html"}'
  printf '%s' '{"title":"New idea","template":"blank"}' | crux call plant_crux - --json

Enable access in Crux Garden → Settings → Agents. The app must be running.
--profile is the desktop userData directory. The installed launcher selects its profile.
--timeout SECONDS bounds a request (default 300, including in-app approval time).
JSON output: {ok:true,result:...} or {ok:false,error:{code,message}}.
Exit codes: 0 success, 1 connection/tool failure, 2 invalid command or arguments.
A timed-out write may have completed; inspect the app before retrying.
Nursery/Docker remains a separate optional developer CLI.
`;

class CliError extends Error {
  constructor(
    public code: string,
    message: string,
    public exitCode = 1,
  ) {
    super(message);
  }
}

type RpcResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
  [key: string]: unknown;
};

function parse(argv: string[]) {
  let config = process.env.CRUX_CLI_CONFIG;
  let json = false;
  let timeout = 300;
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (['--config', '--folder', '--profile', '--timeout'].includes(arg)) {
      const value = argv[++i];
      if (!value) throw new CliError('USAGE', `${arg} requires a value`, 2);
      if (arg === '--timeout') timeout = Number(value);
      else if (arg === '--folder') config = resolve(value, '.crux', 'mcp.json');
      else if (arg === '--profile')
        config = resolve(value, 'garden-agent-host', '.crux', 'mcp.json');
      else config = resolve(value);
    } else if (arg.startsWith('--') && arg !== '--help') {
      throw new CliError('USAGE', `Unknown option: ${arg}`, 2);
    } else args.push(arg);
  }
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 86400)
    throw new CliError('USAGE', 'Timeout must be 1–86400 seconds', 2);
  return { config: config ?? join(process.cwd(), '.crux', 'mcp.json'), json, timeout, args };
}

async function main() {
  const { config, json, timeout, args } = parse(process.argv.slice(2));
  const [command = 'help', ...rest] = args;
  if (command === 'help' || command === '--help') {
    process.stdout.write(json ? JSON.stringify({ ok: true, result: { help: HELP } }) + '\n' : HELP);
    return;
  }
  let method: string;
  let params: Record<string, unknown> = {};
  if (command === 'status' && !rest.length) method = 'ping';
  else if (command === 'tools' && !rest.length) method = 'tools/list';
  else if (command === 'list' && !rest.length) {
    method = 'tools/call';
    params = { name: 'list_cruxes', arguments: {} };
  } else if (command === 'open' && rest.length === 1) {
    method = 'tools/call';
    params = { name: 'show', arguments: { what: 'crux', cruxId: rest[0] } };
  } else if (command === 'call' && rest.length >= 1 && rest.length <= 2) {
    let input: unknown;
    try {
      input = JSON.parse(rest[1] === '-' ? readFileSync(0, 'utf8') : (rest[1] ?? '{}'));
    } catch {
      throw new CliError('USAGE', 'Tool arguments must be a JSON object', 2);
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new CliError('USAGE', 'Tool arguments must be a JSON object', 2);
    method = 'tools/call';
    params = { name: rest[0], arguments: input };
  } else throw new CliError('USAGE', 'Unknown command or wrong arguments. Run crux help.', 2);

  let selected: { url: string; token: string };
  try {
    selected = JSON.parse(readFileSync(config, 'utf8'));
    const url = new URL(selected.url);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
      url.username ||
      url.password ||
      typeof selected.token !== 'string' ||
      !selected.token
    )
      throw new Error('invalid');
  } catch {
    throw new CliError(
      'HOST_OFF',
      'No valid local Agent Host config. Enable access in Settings → Agents, or select --folder / --profile / --config.',
    );
  }
  let session: string | null = null;
  let id = 0;
  const request = async (
    method: string,
    params: Record<string, unknown> = {},
    notification = false,
  ): Promise<RpcResult> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${selected.token}`,
    };
    if (session) headers['Mcp-Session-Id'] = session;
    let response: Response;
    try {
      response = await fetch(selected.url, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(timeout * 1000),
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(notification ? {} : { id: ++id }),
          method,
          params,
        }),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new CliError(
        timedOut ? 'TIMEOUT' : 'UNREACHABLE',
        timedOut
          ? 'Request timed out; an operation may still finish in the app. Inspect before retrying.'
          : 'Crux Garden is not reachable. Open the app and enable the selected Agent Host.',
      );
    }
    session = response.headers.get('mcp-session-id') ?? session;
    if (!response.ok)
      throw new CliError(
        'HTTP',
        `Agent Host returned HTTP ${response.status}. Check access in Settings → Agents.`,
      );
    if (notification || response.status === 202) return {};
    const body = await response.text();
    const payload = response.headers.get('content-type')?.includes('text/event-stream')
      ? body
          .split(/\r?\n\r?\n/)
          .map((block) =>
            block
              .split(/\r?\n/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n'),
          )
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .find((message) => message.id === id)
      : JSON.parse(body);
    if (!payload || payload.id !== id)
      throw new CliError('PROTOCOL', 'Agent Host returned an unexpected response');
    if (payload.error) throw new CliError('RPC', String(payload.error.message));
    return payload.result;
  };
  try {
    const initialized = await request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'Crux Garden CLI', version: '1' },
    });
    await request('notifications/initialized', {}, true);
    const reply = await request(method, params);
    const result = command === 'status' ? { ...reply, serverInfo: initialized.serverInfo } : reply;
    if (result.isError)
      throw new CliError(
        'TOOL',
        result.content?.map((c) => c.text ?? '').join('\n') || 'Tool failed',
      );
    if (json) process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
    else if (command === 'status')
      process.stdout.write(
        'Connected to Crux Garden. Run crux tools to discover available actions.\n',
      );
    else if (command === 'tools') {
      const tools = result.tools as Array<{ name: string; description?: string }>;
      process.stdout.write(
        tools.map((tool) => `${tool.name} — ${tool.description ?? ''}`).join('\n') +
          '\n\nUse crux tools --json for input schemas.\n',
      );
    } else
      process.stdout.write(
        result.content?.map((c) => c.text ?? `[${c.type} content; use --json]`).join('\n') + '\n',
      );
  } finally {
    if (session)
      await fetch(selected.url, {
        method: 'DELETE',
        redirect: 'error',
        signal: AbortSignal.timeout(2000),
        headers: { Authorization: `Bearer ${selected.token}`, 'Mcp-Session-Id': session },
      }).catch(() => {});
  }
}

main().catch((error: unknown) => {
  const failure =
    error instanceof CliError
      ? error
      : new CliError('PROTOCOL', 'Could not read the Agent Host response');
  if (process.argv.includes('--json'))
    process.stdout.write(
      JSON.stringify({ ok: false, error: { code: failure.code, message: failure.message } }) + '\n',
    );
  else process.stderr.write(`crux: ${failure.message}\n`);
  process.exitCode = failure.exitCode;
});
