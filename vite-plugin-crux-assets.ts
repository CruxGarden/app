import { createReadStream, readFileSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { isFileServingAllowed, type Plugin } from 'vite';

/** Built tool files are portable bytes, not styles/modules for the Garden bundler to transform. */
export default function cruxAssets(): Plugin {
  const prefix = '\0crux-package-asset:';
  const paths = new Map<string, string>();
  const devFiles = new Map<string, string>();
  let building = false;
  let devPrefix = '/__crux-assets/';
  return {
    name: 'crux-package-assets',
    enforce: 'pre',
    configResolved(config) {
      building = config.command === 'build';
      devPrefix = config.base + '__crux-assets/';
    },
    configureServer(server) {
      // Only URLs registered by ?url imports resolve here. Never interpret a
      // requested URL as a filesystem path or let Vite transform these bytes.
      // Run after Vite's Host/CORS/filesystem middleware. The SPA fallback may
      // have changed req.url by then, so route by the original request URL.
      return () =>
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.originalUrl || req.url || '/', 'http://localhost').pathname;
          if (!url.startsWith(devPrefix)) return next();
          const refuse = (status: number) => {
            res.writeHead(status, { 'Cache-Control': 'no-store' });
            res.end();
          };
          const path = devFiles.get(url);
          if (!path) return refuse(404);
          if (req.method !== 'GET' && req.method !== 'HEAD') return refuse(405);
          void (async () => {
            if (!isFileServingAllowed(server.config, path)) return refuse(403);
            const target = await realpath(path);
            if (!isFileServingAllowed(server.config, target)) return refuse(403);
            const info = await stat(target);
            if (!info.isFile()) return refuse(404);
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Length': info.size,
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            });
            if (req.method === 'HEAD') return res.end();
            const file = createReadStream(target);
            res.once('close', () => file.destroy());
            file.once('error', () => res.destroy());
            file.pipe(res);
          })().catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') refuse(404);
            else next(error);
          });
        });
    },
    async resolveId(source, importer) {
      if (!/[?&]url(?:&|$)/.test(source)) return;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      const path = resolved?.id.split('?')[0];
      if (!path || !/-crux\//.test(path)) return;
      // Hide source extensions: Vite treats even "icon.svg.js" as an image
      // request. These virtual modules always export a URL as JavaScript.
      const id = prefix + createHash('sha256').update(path).digest('hex') + '.js';
      paths.set(id, path);
      return id;
    },
    load(id) {
      const path = paths.get(id);
      if (!path) return;
      if (!building) {
        const key = createHash('sha256').update(path).digest('hex');
        const url = `${devPrefix}${key}/${encodeURIComponent(basename(path))}`;
        devFiles.set(url, path);
        return `export default ${JSON.stringify(url)};`;
      }
      const ref = this.emitFile({
        type: 'asset',
        name: basename(path),
        source: readFileSync(path),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}
