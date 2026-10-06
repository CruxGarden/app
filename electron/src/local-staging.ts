import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { PreviewServer } from './preview-server';
import { isLoopbackHost } from './loopback';

export interface StagedSite {
  id: string;
  title: string;
  revision: string;
  savedAt: string;
  bytes: number;
  sourceHash?: string;
  url: string;
}
export interface StageInput {
  id: string;
  title: string;
  sourceHash?: string;
  files: { path: string; data: Uint8Array }[];
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Independent immutable website snapshots. No hosted credentials, metadata or Store writes. */
export class LocalStaging {
  private preview: PreviewServer;
  private queue: Promise<unknown> = Promise.resolve();
  private gallery?: http.Server;
  private galleryUrl?: string;
  private theme: Record<string, string> = {};
  constructor(private root: string) {
    if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink())
      throw new Error('Linked test Gardens are not supported');
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
    this.preview = new PreviewServer(
      (folder) => {
        const relative = path.relative(this.root, folder);
        if (!/^[a-f0-9-]{36}(?:[\\/][a-f0-9-]{36})?$/i.test(relative))
          throw new Error('Unknown test website');
        this.safe(relative);
        return folder;
      },
      {
        // A staging test must not submit forms or API calls to production.
        'Content-Security-Policy':
          "connect-src 'self'; form-action 'none'; frame-src 'self' blob: data:; object-src 'none'; worker-src 'none'",
      },
      (folder) => {
        const id = path.basename(folder);
        const record = this.read(id);
        if (!record) throw new Error('Test website unavailable');
        return this.safe(`${id}/${record.revision}`);
      },
    );
  }
  private safe(relative: string): string {
    if (fs.lstatSync(this.root).isSymbolicLink() || fs.realpathSync(this.root) !== this.root)
      throw new Error('The test Garden location changed');
    const target = path.join(this.root, relative);
    let cursor = this.root;
    for (const part of relative.split(/[\\/]/)) {
      if (!part || part === '.' || part === '..') throw new Error('Invalid test path');
      cursor = path.join(cursor, part);
      if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink())
        throw new Error('Linked test paths are not supported');
    }
    return target;
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  private read(id: string): Omit<StagedSite, 'url'> | null {
    if (!uuid.test(id)) throw new Error('Invalid Crux identity');
    const file = this.safe(`${id}/active.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      data.id !== id ||
      !uuid.test(data.revision) ||
      typeof data.title !== 'string' ||
      typeof data.savedAt !== 'string' ||
      !Number.isFinite(data.bytes)
    )
      throw new Error('The saved test website could not be read');
    return data;
  }
  private async site(record: Omit<StagedSite, 'url'>): Promise<StagedSite> {
    return {
      ...record,
      url: await this.preview.start(this.safe(record.id)),
    };
  }
  publish(input: StageInput): Promise<StagedSite> {
    return this.serial(async () => {
      if (
        !input ||
        !uuid.test(input.id) ||
        typeof input.title !== 'string' ||
        input.title.length > 500
      )
        throw new Error('Invalid test website');
      if (!Array.isArray(input.files) || !input.files.length || input.files.length > 5000)
        throw new Error('A test website needs 1–5,000 files');
      let bytes = 0;
      const paths = new Set<string>();
      for (const file of input.files) {
        if (
          typeof file.path !== 'string' ||
          file.path.length > 1024 ||
          file.path.includes('\\') ||
          /[:?#]/.test(file.path) ||
          [...file.path].some((char) => char.charCodeAt(0) < 32) ||
          file.path
            .split('/')
            .some((p) => !p || p.startsWith('.') || p === 'node_modules' || /\.(key|pem)$/i.test(p))
        )
          throw new Error('The website contains a private or invalid file path');
        const key = file.path.toLowerCase();
        if (paths.has(key)) throw new Error('The website contains duplicate file paths');
        paths.add(key);
        if (!(file.data instanceof Uint8Array)) throw new Error('Invalid website bytes');
        bytes += file.data.byteLength;
        if (bytes > 100 * 1024 * 1024) throw new Error('Local test websites are limited to 100 MB');
      }
      if (!input.files.some((file) => file.path === 'index.html'))
        throw new Error('The website needs an index.html page');
      if (input.sourceHash !== undefined && !/^[a-f0-9]{64}$/.test(input.sourceHash))
        throw new Error('Invalid website source identity');
      const previous = this.read(input.id);
      const revision = randomUUID();
      const folder = this.safe(`${input.id}/${revision}`);
      fs.mkdirSync(folder, { recursive: true });
      const record = {
        id: input.id,
        title: input.title,
        revision,
        savedAt: new Date().toISOString(),
        bytes,
        sourceHash: input.sourceHash,
      };
      try {
        for (const file of input.files) {
          const target = this.safe(`${input.id}/${revision}/${file.path}`);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, file.data, { flag: 'wx' });
        }
        const result = await this.site(record);
        const temp = this.safe(`${input.id}/${revision}.json`);
        fs.writeFileSync(temp, JSON.stringify(record), { flag: 'wx' });
        fs.renameSync(temp, this.safe(`${input.id}/active.json`));
        if (previous) {
          const old = this.safe(`${input.id}/${previous.revision}`);
          try {
            fs.rmSync(old, { recursive: true, force: true });
          } catch {
            /* Active snapshot is committed; old scratch bytes can be removed with the test copy. */
          }
        }
        return result;
      } catch (error) {
        // Never remove an acknowledged active snapshot after cleanup failure.
        if (this.read(input.id)?.revision !== revision) {
          if (!previous) await this.preview.stop(this.safe(input.id)).catch(() => {});
          fs.rmSync(folder, { recursive: true, force: true });
        }
        throw error;
      }
    });
  }
  list(): Promise<StagedSite[]> {
    return this.serial(async () => {
      const records = fs
        .readdirSync(this.root)
        .filter((id) => uuid.test(id))
        .map((id) => this.read(id))
        .filter((r): r is Omit<StagedSite, 'url'> => !!r);
      return Promise.all(records.map((record) => this.site(record)));
    });
  }
  remove(id: string): Promise<void> {
    return this.serial(async () => {
      const previous = this.read(id);
      if (previous) {
        // Stop serving before acknowledging removal. A refused unlink retains a reopenable copy.
        await this.preview.stop(this.safe(id));
        fs.unlinkSync(this.safe(`${id}/active.json`));
      }
      // Also retry cleanup when a prior removal committed but filesystem cleanup failed.
      fs.rmSync(this.safe(id), { recursive: true, force: true });
    });
  }
  async openGarden(theme: Record<string, string> = {}): Promise<string> {
    return this.serial(async () => {
      this.theme = theme && typeof theme === 'object' ? theme : {};
      if (this.galleryUrl) return this.galleryUrl;
      const server = http.createServer(async (req, res) => {
        if (
          !isLoopbackHost(req.headers.host) ||
          !['GET', 'HEAD'].includes(req.method ?? '') ||
          req.url !== '/'
        ) {
          res.writeHead(403).end();
          return;
        }
        try {
          const sites = await this.list();
          const css = [
            '--color-bg',
            '--color-surface',
            '--color-text',
            '--color-text-muted',
            '--color-accent',
            '--color-border',
            '--font-body',
            '--font-display',
            '--font-scale',
            '--radius-lg',
          ]
            .map((key) => {
              const value = this.theme[key];
              return typeof value === 'string' && value.length < 200 && !/[<>;{}]/.test(value)
                ? `${key}:${value}`
                : '';
            })
            .join(';');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          });
          res.end(
            `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local test Garden</title><style>:root{${css}}body{margin:0;background:var(--color-bg,Canvas);color:var(--color-text,CanvasText);font-family:var(--font-body,system-ui);font-size:calc(1rem * var(--font-scale,1))}main{max-width:900px;margin:64px auto;padding:24px}p{line-height:1.6}ul{padding:0;display:grid;gap:16px;list-style:none}li{padding:24px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg)}a{color:var(--color-accent,LinkText)}small{color:var(--color-text-muted)}h1,h2{font-family:var(--font-display,system-ui)}</style><main><p>ON THIS COMPUTER · TESTING ONLY</p><h1>Local test Garden</h1><p>Saved website snapshots. Editing a project does not change its test copy or its live site. Update a test copy from Share.</p><p>Available while Crux Garden is running. These addresses are not internet links and may change after restarting. Hosted accounts, Functions and form submissions are not available here.</p><ul>${sites.map((site) => `<li><h2><a href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site.title)}</a></h2><small>Saved ${escapeHtml(new Date(site.savedAt).toLocaleString())}</small></li>`).join('')}</ul>${sites.length ? '' : '<p>No test websites yet. Open a website’s Share panel and choose Publish to local test Garden.</p>'}</main></html>`,
          );
        } catch {
          res
            .writeHead(503)
            .end('Could not read your local test Garden. Return to the app and try again.');
        }
      });
      this.gallery = server;
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      this.galleryUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
      return this.galleryUrl;
    });
  }
  clear(): Promise<void> {
    return this.serial(async () => {
      await this.preview.stopAll();
      for (const id of fs.readdirSync(this.root).filter((id) => uuid.test(id))) {
        fs.rmSync(this.safe(id), { recursive: true, force: true });
      }
    });
  }
  async close(): Promise<void> {
    await this.queue;
    await this.preview.stopAll();
    if (this.gallery)
      await new Promise<void>((resolve) => {
        this.gallery!.close(() => resolve());
        this.gallery!.closeAllConnections();
      });
    this.gallery = undefined;
    this.galleryUrl = undefined;
  }
}
