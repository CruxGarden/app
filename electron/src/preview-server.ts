import { claimPreviewPort, releasePreviewPort } from './preview-ports';
import { resolveInsideOrThrow, toPosixRel } from './paths';
import { isLoopbackHost } from './loopback';
const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Desktop preview server (ADR 0003).
 *
 * A plain static webserver per open crux, serving files VERBATIM from the
 * Project Folder — no injection, no rewriting. What's on disk is what serves.
 * Each folder gets its own ephemeral 127.0.0.1 port so every preview has its
 * own origin (mirrors per-crux subdomain isolation in production).
 */

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

function mimeFor(filePath: string): string {
  return MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Capture exclusions are not an access policy: bundled runtime/ assets are ignored by history. */
function privatePreviewPath(relative: string): boolean {
  return relative.split('/').some(
    (part, index, parts) =>
      // Notes stores document images in .assets directories. Their contents
      // are public; nested secrets and symlink destinations still get checked.
      (part.startsWith('.') && !(part === '.assets' && index < parts.length - 1)) ||
      part === 'node_modules' ||
      /\.(pem|key|swp|swx)$/i.test(part) ||
      part.endsWith('~') ||
      part.includes('.crux-write-') ||
      part === 'Thumbs.db',
  );
}

interface RunningServer {
  server: any;
  url: string;
  port: number;
  owner: object;
}

export class PreviewServer {
  private stopping = new Map<string, Promise<void>>();
  private starting = new Map<string, Promise<string>>();
  private running = new Map<string, RunningServer>(); // resolved folder -> server

  constructor(private resolveKnownFolder: (folder: string) => string) {}

  /** Start (or reuse) a static server for a Project Folder. Returns its URL. */
  start(folder: string): Promise<string> {
    const base = this.resolveKnownFolder(folder);
    const existing = this.starting.get(base);
    if (existing) return existing;
    const previousStop = this.stopping.get(base);
    const start = Promise.resolve().then(async () => {
      await previousStop;
      return this.startOwned(base);
    });
    this.starting.set(base, start);
    void start
      .finally(() => {
        if (this.starting.get(base) === start) this.starting.delete(base);
      })
      .catch(() => {});
    return start;
  }
  private async startOwned(folder: string): Promise<string> {
    const base = this.resolveKnownFolder(folder);
    const existing = this.running.get(base);
    if (existing) return existing.url;

    const owner = {};
    const server = http.createServer((req: any, res: any) => {
      this.handle(base, req, res);
    });

    let port = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      port = server.address().port;
      if (claimPreviewPort(port, owner)) break;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      port = 0;
    }
    if (!port) throw new Error('Could not allocate a distinct static preview port. Try again.');
    const url = `http://127.0.0.1:${port}`;

    this.running.set(base, { server, url, port: Number(new URL(url).port), owner });
    return url;
  }

  private handle(base: string, req: any, res: any): void {
    const refuse = (status: number, text: string) => {
      res.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end(text);
    };
    // Binding to loopback alone does not prevent a foreign hostname from resolving here.
    if (!isLoopbackHost(req.headers.host)) {
      refuse(403, 'Forbidden');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      refuse(405, 'Method not allowed');
      return;
    }
    let relative: string;
    try {
      relative = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
    } catch {
      refuse(400, 'Invalid path');
      return;
    }
    // Check both the requested name and its resolved destination. A harmless-looking
    // symlink must not expose .crux/mcp.json or an external file.
    const resolvePublic = (name: string) => {
      if (privatePreviewPath(name)) throw new Error('Private path');
      const target = resolveInsideOrThrow(base, name);
      if (fs.existsSync(target)) {
        const real = fs.realpathSync.native(target);
        if (privatePreviewPath(toPosixRel(fs.realpathSync.native(base), real)))
          throw new Error('Private destination');
        return real as string;
      }
      return target;
    };
    let target: string;
    try {
      target = resolvePublic(relative || 'index.html');
      let stat = fs.existsSync(target) ? fs.statSync(target) : null;
      if (stat?.isDirectory()) {
        target = resolvePublic(path.posix.join(relative, 'index.html'));
        stat = fs.existsSync(target) ? fs.statSync(target) : null;
      }
      if (!stat?.isFile()) {
        refuse(404, 'Not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': mimeFor(target),
        'Content-Length': stat.size,
        // Always fresh — this is a live workspace, not a CDN
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const file = fs.createReadStream(target);
      res.once('close', () => file.destroy());
      file.once('error', () => res.destroy());
      file.pipe(res);
    } catch {
      refuse(403, 'Forbidden');
    }
  }

  stop(folder: string): Promise<void> {
    const base = this.resolveKnownFolder(folder);
    const existing = this.stopping.get(base);
    if (existing) return existing;
    const pendingStart = this.starting.get(base);
    const stop = Promise.resolve().then(async () => {
      await pendingStart?.catch(() => {});
      await this.stopOwned(base);
    });
    this.stopping.set(base, stop);
    void stop
      .finally(() => {
        if (this.stopping.get(base) === stop) this.stopping.delete(base);
      })
      .catch(() => {});
    return stop;
  }
  private async stopOwned(base: string): Promise<void> {
    const running = this.running.get(base);
    if (!running) return;
    await new Promise<void>((resolve) => {
      running.server.close(() => resolve());
      // A closing preview can leave an active request behind. Stop accepting
      // connections first, then release its sockets so app shutdown can finish.
      running.server.closeAllConnections();
    });
    releasePreviewPort(running.port, running.owner);
    if (this.running.get(base) === running) this.running.delete(base);
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      [...new Set([...this.running.keys(), ...this.starting.keys()])].map((folder) =>
        this.stop(folder),
      ),
    );
  }
}
