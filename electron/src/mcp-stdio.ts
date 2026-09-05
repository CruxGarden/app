#!/usr/bin/env node
/**
 * `crux-mcp` — stdio launcher for a crux's Agent Host (ADR 0013).
 *
 * Some MCP clients only speak stdio. This script is a thin proxy: JSON-RPC
 * lines on stdin are POSTed to the crux's streamable-HTTP endpoint with the
 * Bearer token from `.crux/mcp.json`; responses come back as lines on stdout.
 * It has NO dependencies (plain `node`, Node 18+ for fetch) so it can be run
 * from the unpacked app bundle without the SDK's dependency tree.
 *
 *   node mcp-stdio.js --config ~/CruxGarden/my-blog/.crux/mcp.json
 *   node mcp-stdio.js --folder ~/CruxGarden/my-blog
 *
 * The config is re-read on every request, so a regenerated token or a new
 * port after an app restart is picked up without restarting the client.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

export {}; // a module, not a script — keeps these requires out of the global scope

interface Config {
  url: string;
  token: string;
}

function usage(): never {
  process.stderr.write(
    'usage: crux-mcp --config <ProjectFolder>/.crux/mcp.json | --folder <ProjectFolder>\n',
  );
  process.exit(2);
}

function configPathFromArgs(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) return path.resolve(argv[i + 1]!);
    if (argv[i] === '--folder' && argv[i + 1]) {
      return path.resolve(argv[i + 1]!, '.crux', 'mcp.json');
    }
  }
  return usage();
}

function readConfig(file: string): Config {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof parsed.url !== 'string' || typeof parsed.token !== 'string') {
    throw new Error(`${file} is not an Agent Host config (missing url/token)`);
  }
  return parsed;
}

/** Split an SSE body into its JSON `data:` payloads (the server answers in JSON, this is the fallback). */
function sseData(body: string): string[] {
  const out: string[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n');
    if (data) out.push(data);
  }
  return out;
}

async function main() {
  const configFile = configPathFromArgs(process.argv.slice(2));
  let sessionId: string | null = null;
  const write = (obj: unknown) => process.stdout.write(JSON.stringify(obj) + '\n');

  const forward = async (line: string) => {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return; // not JSON-RPC — ignore, as a stdio server would
    }
    let config: Config;
    try {
      config = readConfig(configFile);
    } catch (err: any) {
      if (message.id !== undefined) {
        write({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32000,
            message: `Agent Host is off for this crux (${err.message}). Switch it on in Crux Garden → Settings → Agents.`,
          },
        });
      }
      return;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${config.token}`,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    let res: Response;
    try {
      res = await fetch(config.url, { method: 'POST', headers, body: JSON.stringify(message) });
    } catch (err: any) {
      if (message.id !== undefined) {
        write({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32000,
            message: `Crux Garden is not reachable at ${config.url} (${err.message}). Is the app running?`,
          },
        });
      }
      return;
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
    if (res.status === 404 && sessionId) sessionId = null; // server forgot us; re-initialize next time
    const text = await res.text();
    if (!text) {
      if (!res.ok && message.id !== undefined) {
        write({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32000, message: `HTTP ${res.status} from Crux Garden` },
        });
      }
      return;
    }
    const type = res.headers.get('content-type') || '';
    const payloads = type.includes('text/event-stream') ? sseData(text) : [text];
    for (const p of payloads) {
      try {
        const parsed = JSON.parse(p);
        if (Array.isArray(parsed)) parsed.forEach(write);
        else if (parsed.jsonrpc) write(parsed);
        else if (message.id !== undefined) {
          write({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: parsed.error || `HTTP ${res.status}` },
          });
        }
      } catch {
        /* not JSON — drop */
      }
    }
  };

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  // Serialize: MCP over stdio is ordered, and initialize must complete before
  // the session id exists for the requests that follow it.
  let queue: Promise<void> = Promise.resolve();
  rl.on('line', (line: string) => {
    if (!line.trim()) return;
    queue = queue.then(() => forward(line)).catch(() => {});
  });
  rl.on('close', () => {
    queue.then(async () => {
      if (sessionId) {
        try {
          const config = readConfig(configFile);
          await fetch(config.url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${config.token}`, 'Mcp-Session-Id': sessionId },
          });
        } catch {}
      }
      process.exit(0);
    });
  });
}

main().catch((err) => {
  process.stderr.write(`crux-mcp: ${err?.message || err}\n`);
  process.exit(1);
});
