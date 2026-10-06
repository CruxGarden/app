import type { Plugin } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Vite dev normally falls back to the SPA for directory paths in public/. */
export default function documentation(): Plugin {
  return {
    name: 'documentation-publications',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (/^\/(docs|blog)(\/|$)/.test(url.pathname) && !/\.[^/]+$/.test(url.pathname)) {
          const entry = `${url.pathname.replace(/\/$/, '')}/index.html`;
          if (existsSync(resolve(server.config.publicDir, `.${entry}`)))
            request.url = `${entry}${url.search}`;
        }
        next();
      });
    },
  };
}
